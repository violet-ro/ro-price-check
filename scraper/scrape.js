// scrape.js
// Walks every page of /vending/, visits every vendor's /vending/viewshop/?id=N,
// and appends a dated snapshot of every item listing to data/vending-history.json.
//
// Run manually:   npm run scrape
// Run on a schedule via .github/workflows/scrape.yml

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseVendorListPage, parseVendorShopPage } = require('./parse');

const BASE_URL = 'https://classiccp.niktoutro.com';
const DATA_PATH = path.join(__dirname, '..', 'data', 'vending-history.json');
const REQUEST_DELAY_MS = 800; // be polite - this is someone else's small server
const MAX_RETRIES = 3;

// The control panel requires a logged-in session to view /vending/ pages.
// Rather than automating the login form, this reads a raw browser "Cookie"
// header value from an env var (see README.md: "Getting the session cookie").
// Set it locally as:  VENDING_SESSION_COOKIE="..." npm run scrape
// and in GitHub Actions as a repo secret of the same name.
const SESSION_COOKIE = process.env.VENDING_SESSION_COOKIE || '';

if (!SESSION_COOKIE) {
  console.error(
    'ERROR: VENDING_SESSION_COOKIE is not set. The vending pages require a logged-in ' +
      'session. See README.md ("Getting the session cookie") for how to obtain and set it.'
  );
  process.exit(1);
}

// A realistic browser UA/header set, plus the session cookie above.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: SESSION_COOKIE,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Heuristic check for "this response is a login page, not the page we asked
// for" - i.e. the session cookie has expired or was never valid. Checking for
// a password field is more robust than checking status codes, since an
// expired-session redirect to the login page is still an HTTP 200.
//
// NOTE: this deliberately does NOT check for an "/account/login/" link -
// the sidebar nav on classiccp.niktoutro.com includes a "Log In" link on
// every page regardless of auth state, so that would false-positive on
// every single request. Confirmed against the real logged-in page source.
function looksLoggedOut(html) {
  return /type=["']password["']/i.test(html);
}

async function fetchHtml(url, { expectLoggedIn = true } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await axios.get(url, { headers: HEADERS, timeout: 20000 });
      if (expectLoggedIn && looksLoggedOut(res.data)) {
        const err = new Error('SESSION_EXPIRED');
        err.isSessionExpired = true;
        throw err;
      }
      return res.data;
    } catch (err) {
      if (err.isSessionExpired) throw err; // don't retry - retrying won't fix an expired cookie
      lastErr = err;
      console.warn(`  fetch failed (attempt ${attempt}/${MAX_RETRIES}) for ${url}: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(REQUEST_DELAY_MS * attempt * 2);
    }
  }
  throw lastErr;
}

async function scrapeAll() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  console.log(`Starting scrape for ${today}...`);

  // Step 1: first vendor listing page, discover total page count
  const firstPageHtml = await fetchHtml(`${BASE_URL}/vending/?p=1`);
  const { vendors: firstVendors, totalPages } = parseVendorListPage(firstPageHtml);

  let allVendors = [...firstVendors];
  console.log(`Page 1/${totalPages}: ${firstVendors.length} vendor(s).`);
  await sleep(REQUEST_DELAY_MS);

  for (let p = 2; p <= totalPages; p++) {
    const html = await fetchHtml(`${BASE_URL}/vending/?p=${p}`);
    const { vendors } = parseVendorListPage(html);
    console.log(`Page ${p}/${totalPages}: ${vendors.length} vendor(s).`);
    allVendors = allVendors.concat(vendors);
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`Found ${allVendors.length} vendor(s) total across ${totalPages} page(s).`);

  // Step 2: visit every vendor's shop page and collect item rows
  const newRecords = [];
  for (const [i, vendor] of allVendors.entries()) {
    try {
      const shopHtml = await fetchHtml(`${BASE_URL}/vending/viewshop/?id=${vendor.vendorId}`);
      const { items } = parseVendorShopPage(shopHtml);

      for (const item of items) {
        newRecords.push({
          date: today,
          vendorId: vendor.vendorId,
          vendorName: vendor.vendorName,
          shopTitle: vendor.shopTitle,
          map: vendor.map,
          x: vendor.x,
          y: vendor.y,
          gender: vendor.gender,
          itemId: item.itemId,
          itemName: item.itemName,
          refine: item.refine,
          slot: item.slot,
          cards: item.cards,
          price: item.price,
          amount: item.amount,
        });
      }

      console.log(`[${i + 1}/${allVendors.length}] vendor ${vendor.vendorId} (${vendor.vendorName}): ${items.length} item(s).`);
    } catch (err) {
      if (err.isSessionExpired) throw err; // stop the whole run - no point hitting every remaining vendor against a login wall
      console.error(`[${i + 1}/${allVendors.length}] FAILED vendor ${vendor.vendorId} (${vendor.vendorName}): ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`Collected ${newRecords.length} item listing(s) for ${today}.`);

  // Step 3: load existing history, drop any rows already recorded today
  // (so re-running the same day is safe/idempotent), append, and save.
  let history = [];
  if (fs.existsSync(DATA_PATH)) {
    try {
      history = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      if (!Array.isArray(history)) history = [];
    } catch (err) {
      console.error(`Could not parse existing ${DATA_PATH}, starting fresh: ${err.message}`);
      history = [];
    }
  }

  const beforeCount = history.length;
  history = history.filter((r) => r.date !== today);
  history = history.concat(newRecords);

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(history));

  console.log(`History: ${beforeCount} -> ${history.length} record(s). Saved to ${DATA_PATH}.`);

  if (newRecords.length === 0) {
    console.warn('WARNING: 0 new records collected. If this persists, the scraper may be getting blocked - check README.md.');
  }
}

scrapeAll().catch((err) => {
  if (err.isSessionExpired) {
    console.error(
      'ERROR: Session cookie appears to be expired or invalid (got redirected to a login page). ' +
        'Grab a fresh cookie value and update VENDING_SESSION_COOKIE - see README.md.'
    );
  } else {
    console.error('Scrape failed:', err);
  }
  process.exit(1);
});
