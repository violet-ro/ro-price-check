// parse.js
// Pure parsing functions - no network calls in here, so they're easy to unit test
// against saved HTML samples. Keeping this separate from scrape.js on purpose.

const cheerio = require('cheerio');

/**
 * Parse a /vending/?p=N listing page.
 * Returns { vendors: [...], totalPages: number }
 */
function parseVendorListPage(html) {
  const $ = cheerio.load(html);
  const vendors = [];

  $('table.horizontal-table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 7) return;

    const idLink = $(cells[0]).find('a');
    const hrefMatch = (idLink.attr('href') || '').match(/id=(\d+)/);
    const vendorId = hrefMatch ? parseInt(hrefMatch[1], 10) : null;

    const vendorName = $(cells[1]).text().replace(/\s+/g, ' ').trim();
    const shopTitle = $(cells[2]).find('a').text().replace(/\s+/g, ' ').trim();
    const map = $(cells[3]).text().replace(/\s+/g, ' ').trim();
    const x = parseInt($(cells[4]).text().trim(), 10);
    const y = parseInt($(cells[5]).text().trim(), 10);
    const gender = $(cells[6]).text().replace(/\s+/g, ' ').trim();

    if (vendorId !== null) {
      vendors.push({
        vendorId,
        vendorName,
        shopTitle,
        map,
        x: Number.isNaN(x) ? null : x,
        y: Number.isNaN(y) ? null : y,
        gender,
      });
    }
  });

  let totalPages = 1;
  const infoText = $('p.info-text').text();
  const pageMatch = infoText.match(/across\s+(\d+)\s+page/i);
  if (pageMatch) {
    totalPages = parseInt(pageMatch[1], 10);
  }

  return { vendors, totalPages };
}

/**
 * Turn "200 000 z" -> 200000. Returns null if nothing parseable.
 */
function cleanPrice(text) {
  const digits = (text || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/**
 * Parse a /vending/viewshop/?id=N page.
 * Returns { items: [...] } - vendor/shop metadata is already known from the
 * listing page, so this only extracts the item rows.
 */
function parseVendorShopPage(html) {
  const $ = cheerio.load(html);
  const items = [];

  $('table.horizontal-table tbody tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 10) return;

    const itemId = parseInt($(cells[0]).text().trim(), 10);
    const itemName = $(cells[1]).clone().find('img').remove().end().text().replace(/\s+/g, ' ').trim();
    const refine = $(cells[2]).text().replace(/\s+/g, ' ').trim() || null;
    const slot = $(cells[3]).text().replace(/\s+/g, ' ').trim() || null;

    const cards = [];
    for (let i = 4; i <= 7; i++) {
      const cardText = $(cells[i]).text().replace(/\s+/g, ' ').trim();
      if (cardText && cardText.toLowerCase() !== 'none') {
        cards.push(cardText);
      }
    }

    const price = cleanPrice($(cells[8]).text());
    const amountRaw = $(cells[9]).text().trim();
    const amount = parseInt(amountRaw, 10);

    if (!Number.isNaN(itemId) && itemName) {
      items.push({
        itemId,
        itemName,
        refine,
        slot,
        cards,
        price,
        amount: Number.isNaN(amount) ? null : amount,
      });
    }
  });

  return { items };
}

module.exports = { parseVendorListPage, parseVendorShopPage, cleanPrice };
