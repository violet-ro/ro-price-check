# NiktoutRO vending ledger

A price tracker for [classiccp.niktoutro.com/vending](https://classiccp.niktoutro.com/vending/). A
scheduled scraper takes a daily snapshot of every vendor's listings; a static page lets you search
for an item by partial name and see a scatter plot of what it's sold for, by shop, over time.

## How it's put together

This can't be a single self-contained HTML file, because the browser can't scrape another site
directly (CORS, and the site's own bot protection). So it's split in two:

- **`scraper/`** — a Node.js script that walks every page of `/vending/`, visits every vendor's
  `/vending/viewshop/?id=N`, and appends what it finds to `data/vending-history.json`. This runs
  *outside* the browser, once a day.
- **`index.html`** — a static page that reads `data/vending-history.json` and gives you the search
  box and chart. This is what you actually look at.

A GitHub Actions workflow (`.github/workflows/scrape.yml`) runs the scraper on a schedule and
commits the updated JSON back to the repo, so the page always reflects the latest scrape without
you doing anything.

### About "date"

The site itself doesn't record when a vendor listed an item — only what's currently for sale. So
every record's `date` is **the day the scraper observed it**, not necessarily when the vendor
first put it up. Run daily over time, this still builds a real price history; it's just worth
knowing what the date actually means. It's stated at the bottom of the page, too.

### About login and Cloudflare

Two separate walls stand between the scraper and the real data, and it's worth knowing which is
which when something breaks:

1. **Cloudflare.** The whole site sits behind Cloudflare, which challenges automated-looking
   requests before they even reach the control panel itself — this has nothing to do with your
   account. A plain HTTP request (what the scraper originally used) can't get past this, because
   the challenge requires executing JavaScript. That's why the scraper drives a real (if headless)
   [Playwright](https://playwright.dev/) Chromium browser instead of just making HTTP calls — see
   "How this gets past Cloudflare" below for how well that actually works.
2. **The control panel's own login.** Viewing `/vending/` separately requires a logged-in session.
   Rather than automating the login form (which would mean storing an account password as a
   secret), the scraper takes a **session cookie** via an environment variable and attaches it to
   the browser context. See "Getting the session cookie" below.

The cookie will eventually expire and need refreshing — how often depends on the site's session
settings, which there's no way to know in advance except by watching it in practice. The scraper
detects both failure modes itself and fails loudly with a distinct, specific error
(`SESSION_EXPIRED` or `CLOUDFLARE_CHALLENGE`) in the log, rather than silently writing empty data.

## How this gets past Cloudflare (and its limits)

A headless browser can execute Cloudflare's challenge script, which a plain HTTP client can't —
that's the necessary first step, and it's what changed in the scraper. It is **not a guarantee**.
Cloudflare's bot management also scores requests on things like the IP address's reputation, and
GitHub Actions runners use well-known shared cloud IP ranges that tend to score worse than a home
connection, regardless of how convincing the browser itself looks. Whether the daily run actually
gets through is something you'll only know by watching the Actions log after triggering it.

If it keeps failing with `CLOUDFLARE_CHALLENGE`, in roughly increasing order of effort:

1. **Headed mode.** Set the `PLAYWRIGHT_HEADLESS` env var to `false` in the workflow (and add an
   `xvfb-run -a` prefix to the `npm run scrape` step, plus `sudo apt-get install -y xvfb` before
   it, since a headed browser needs a display). A headless browser exposes itself in ways a
   real windowed one doesn't, and this closes that gap.
2. **A different IP.** Move the scraper off GitHub-hosted Actions entirely, onto a
   [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) — your own
   computer, a spare machine, or a plain cron job outside GitHub Actions altogether. A residential
   IP is scored very differently than a datacenter one.
3. **Ask the server's staff.** This is worth trying before either of the above, honestly — it's a
   small private server, and reading `/vending/` isn't something you're not entitled to; you're
   just automating what you'd otherwise check by hand. The site links a Discord in its sidebar.
   Server admins can often just allowlist a specific use case, or point you at data they're
   already fine sharing (some private-server panels expose this kind of thing via a public API
   or an export nobody's mentioned). That sidesteps the whole Cloudflare fight rather than trying
   to win it, and is the most durable fix of the three.

## Getting the session cookie

1. Log into the control panel normally in your browser.
2. Open DevTools (F12 or right-click → Inspect) → **Network** tab.
3. Reload `https://classiccp.niktoutro.com/vending/`.
4. Click the first request in the list (`vending` or similar) → find **Request Headers** →
   locate the `Cookie:` header → copy its *entire* value (it may contain several `name=value`
   pairs separated by `;` — copy all of it, not just one).

That full string is what goes into `VENDING_SESSION_COOKIE` below. If your account has a
"remember me" option at login, using it may make the session last longer before you need to
repeat these steps.

**Consider using a dedicated account for this** rather than your main one, if the server allows
multiple accounts — the cookie is a live credential for whatever it's set on, and doesn't need to
be your primary account's.

## Setup

1. **Create a GitHub repo** and push everything in this folder to it (`git init`, `git add -A`,
   `git commit -m "Initial commit"`, then push to a new repo on GitHub).

2. **Add the session cookie as a secret**: repo Settings → Secrets and variables → Actions →
   "New repository secret" → name it `VENDING_SESSION_COOKIE` → paste the cookie value from
   above. This keeps it encrypted and out of the repo itself.

3. **Enable GitHub Pages**: repo Settings → Pages → set "Source" to "Deploy from a branch",
   branch `main`, folder `/ (root)`. Save. Your page will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

4. **Enable Actions**: they're on by default for a new repo. The workflow is already set to run
   daily at 06:00 UTC — edit the `cron` line in `.github/workflows/scrape.yml` to change that.

5. **Trigger the first scrape**: go to the repo's Actions tab → "Daily Vending Scrape" →
   "Run workflow". This does the first real crawl and commits `data/vending-history.json`,
   which the page will then pick up. Check the run's log — it'll tell you plainly if the cookie
   didn't work.

That's it — from here it runs itself. Every day, the workflow re-scrapes, and if anything
changed it commits the update. When the cookie eventually expires, the Actions log will say so
clearly (`SESSION_EXPIRED`) instead of quietly collecting nothing — that's your cue to repeat
"Getting the session cookie" and update the secret.

### Running the scraper locally (optional)

Useful for testing changes before pushing, or if you'd rather run it from your own machine/cron
instead of GitHub Actions:

```bash
cd scraper
npm install
npx playwright install chromium   # one-time: downloads the browser Playwright drives
VENDING_SESSION_COOKIE="paste your cookie value here" npm run scrape
```

This writes straight into `../data/vending-history.json`. Run `npm test` first to check the
parser still matches the site's current HTML structure (see "If the site changes" below).

### Switching to automated login

If cookie refreshing becomes a hassle, the more durable option is having the scraper log in
itself at the start of every run (via a POST to the login form, capturing the resulting session
cookie automatically) instead of relying on a cookie you grabbed by hand. That needs the login
form's actual HTML (field names, any hidden/CSRF token) to implement correctly, and means storing
an account username + password as secrets instead of a cookie — a dedicated scraper-only account
is worth setting up first if you go this route.

## If the scraper gets blocked or logged out

If the daily workflow runs but `data/vending-history.json` stops growing, check the Actions log
first — the script logs a vendor/item count every run and fails loudly with specific errors:

- **`CLOUDFLARE_CHALLENGE` in the log** → Cloudflare didn't let the browser through this run. See
  "How this gets past Cloudflare" above for what to try, in order — this isn't fixed by anything
  to do with the cookie.
- **`SESSION_EXPIRED` in the log** → got through Cloudflare fine, but the cookie itself needs
  refreshing. See "Getting the session cookie" above, then update the `VENDING_SESSION_COOKIE`
  secret.
- **`VENDING_SESSION_COOKIE is not set`** → the secret wasn't picked up — check it's named exactly
  `VENDING_SESSION_COOKIE` in repo Settings → Secrets and variables → Actions.
- **Anything else (timeouts, browser launch errors, etc.)** → check the "Install Playwright's
  Chromium" step in the Actions log succeeded — a failed or skipped browser install is a common
  cause of odd errors in the "Run scraper" step right after it.

Note that bumping the delay between requests (`REQUEST_DELAY_MS` in `scraper/scrape.js`) does
**not** help with `CLOUDFLARE_CHALLENGE` specifically — a managed challenge isn't rate-limiting,
it's a one-time gate that either lets a given browser/IP through or doesn't. It's still worth
keeping the delay as-is regardless, so the crawl doesn't hammer someone else's small server once
it is through.

## If the site changes

The parser (`scraper/parse.js`) is built against the actual HTML `classiccp.niktoutro.com`
returned as of this writing. Two real sample pages are kept in `samples/` for exactly this
reason — if a future site update breaks the scraper, `npm test` (in `scraper/`) will show you
what the parser expects versus what it's getting, and you can update `samples/` with fresh page
source to fix the selectors against.

## File structure

```
index.html                       the page you deploy — search + chart
data/vending-history.json        the growing dataset (committed by the workflow)
scraper/
  scrape.js                      browser automation: walks pages via Playwright, calls parse.js, appends to data/
  parse.js                       pure HTML parsing (cheerio) — unit tested
  cookie-utils.js                pure cookie-header parsing — unit tested
  test-parse.js                  tests for parse.js and cookie-utils.js, against samples/
  package.json
.github/workflows/scrape.yml     daily cron job
samples/                         real sample HTML pages, used by the parser tests
```

## Notes

- The scraper is polite by default: ~800ms between requests, so a crawl of the whole vendor list
  takes a while but doesn't hammer someone else's small private-server host.
- Each day's data is appended, not overwritten, so the dataset grows indefinitely. For a small
  server this stays manageable for a long time, but if `data/vending-history.json` eventually
  gets unwieldy, the simplest fix is trimming records older than some cutoff (e.g. 1 year) at the
  end of `scrape.js`.
