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

### About login

Viewing `/vending/` requires a logged-in session — the scraper can't just request the page like
a public site. Rather than automating the login form (which would mean storing an account
password as a secret), the scraper takes a **session cookie** via an environment variable and
sends it with every request. See "Getting the session cookie" below.

This does mean the cookie will eventually expire and need refreshing — how often depends on the
site's session settings, which there's no way to know in advance except by watching it in
practice. The scraper detects this itself: if a response looks like a login page instead of real
data, it stops immediately with a clear `SESSION_EXPIRED`-style error in the log, rather than
silently writing empty data. If you want something that never needs manual refreshing, automating
the actual login form is the more durable option — see "Switching to automated login" below.

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

- **`SESSION_EXPIRED` in the log** → the cookie needs refreshing. See "Getting the session
  cookie" above, then update the `VENDING_SESSION_COOKIE` secret. This is the most likely cause
  day-to-day, since cookies don't last forever.
- **`VENDING_SESSION_COOKIE is not set`** → the secret wasn't picked up — check it's named exactly
  `VENDING_SESSION_COOKIE` in repo Settings → Secrets and variables → Actions.
- **HTTP errors (timeouts, 403s, etc.) unrelated to login** → the site may additionally be
  rate-limiting or bot-filtering requests regardless of session validity. When building this, a
  direct fetch attempt from outside a browser was rejected outright before login was even known
  to be a factor, so this is worth taking seriously as a separate possibility. If it persists:
  1. **Slow it down further.** Bump `REQUEST_DELAY_MS` in `scraper/scrape.js`.
  2. **Switch to a headless browser.** Replace `axios` with
     [Playwright](https://playwright.dev/) (`npm install playwright` in `scraper/`, then load each
     URL in a real Chromium page, with the session cookie set via
     `context.addCookies(...)`, and return `page.content()`). Looks far more like a real visitor.
  3. **Run it from somewhere else.** GitHub-hosted Actions runners use shared cloud IP ranges
     some bot-protection systems flag more readily than a home connection. A
     [self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) (e.g. a
     spare machine on a residential connection, or your own cron job) sidesteps that.

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
  scrape.js                      network layer: walks pages, calls parse.js, appends to data/
  parse.js                       pure HTML parsing (cheerio) — unit tested
  test-parse.js                  parser tests against samples/
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
