# MarketLens

MarketLens is a shared automotive competitor intelligence application. It searches supported public stores, separates your accounts from pricing competitors and material references, preserves historical observations, and tracks price changes every day.

## What this version does

- A request for **Chevy Corvette 2005–2013 searches 2004–2014**, including every intermediate year. A single year searches its previous, current, and next year. Original requested years and actual listing fitment remain distinct.
- Product names are parsed from the query rather than limited to a dropdown of known vehicles. Chevy/Chevrolet aliases and Ford F-150/F150 spellings are normalized. Listings still require matching product terms and observed fitment.
- All first-time searches are registered centrally and automatically tracked. Repeating the same normalized product and requested range uses the same track.
- **Data History** organizes versioned scans under each tracked vehicle/model, provides variant price history, and can reopen previous analyses.
- The sidebar lists all tracked vehicles and unread alert counts. Primary competitor price changes create notifications; a below-our-price alert requires an available own listing observed within 36 hours, with exactly matching configuration, finish, fitment, material, color, currency, and condition.
- Failed, missing, partial, or unpriced observations never turn into zero prices or artificial deletions. Last known observations are retained separately as comparison baselines, not represented as newly collected data.
- Central team acknowledgement, pause/resume tracking, manual refresh, filtering, exact-segment comparisons, normalization, and XLSX export are included.

## Shared storage and daily refresh

Application code lives on `main`. Shared research lives on the **`market-data` branch of this repository**, in `market/index.json` and versioned `market/snapshots/<id>.json` files. The repository and its research data are **public**, as requested. Do not add confidential documents, credentials, customer information, or private costs to this data store.

The `Refresh tracked markets` GitHub Actions workflow checks once an hour, at minute 23 UTC. Each enabled model becomes due 24 hours after its previous scan. All-source failures retry after one hour. An expiring lease prevents normal overlap between a scheduled scan and manual refresh. GitHub schedule delays can occur, so refresh timing is approximately 24–25 hours plus runner delays, not a real-time guarantee. Public-repository schedules can be disabled by GitHub after 60 days without repository activity; watch the workflow status if the application is unused.

GitHub Actions runs even when your computer is off. It uses the repository's built-in `GITHUB_TOKEN` with `contents: write`; no extra collector secret is required. The workflow can also be run manually, with `force` enabled to refresh all active tracks.

Writes use new Git trees/commits and non-forced reference updates. Concurrent modifications retry against the newest index rather than replacing another team member's work. All price observations and notifications are retained. Interactive price charts load the latest 60 snapshots; the full snapshot archive remains available in Data History and GitHub.

## Run the web application

Requirements: Node.js 24, npm, and GitHub CLI authenticated with write access to this repository.

```powershell
npm ci
npm run dev:shared
```

Open the printed address, normally **http://localhost:5173**. The shared development script reads the existing `gh auth token` into server memory; credentials are never sent to the browser or committed. It uses `aliahmadi1382/Market_Lens` by default; set `MARKETLENS_DATA_REPO` to change the repository for another installation.

All configured instances read/write the same central data. The local development server itself is not a public team deployment. For a hosted team instance, provision a Cloudflare Worker or another compatible server and configure server-side secrets:

- `MARKETLENS_DATA_REPO`: owner/repository.
- `MARKETLENS_GITHUB_TOKEN`: a narrowly scoped repository Contents read/write token.
- `MARKETLENS_TEAM_PASSWORD`: required for write access on any non-loopback hostname. The browser uses HTTP Basic authentication for write operations; use HTTPS.

Read access reflects the public data repository. Remote writes fail closed without the team password. A dedicated production identity provider and individual team accounts are appropriate before expanding beyond a small shared workspace. No always-on hosted UI has been provisioned by merely pushing this repository.

The earlier local D1 database is retained as a legacy source, but new research uses GitHub shared storage. Original local scans can be migrated with `scripts/import-history.ts` after exporting their JSON; the script preserves original IDs and times.

## Commands

```powershell
npm run dev:shared    # local web app connected to the shared repository
npm run dev           # development without a write token; shared data read-only
npm run build         # deployable Worker + browser bundle
npm run typecheck
npm test
npm run refresh       # requires GITHUB_TOKEN or MARKETLENS_GITHUB_TOKEN
```

Run `App checks` and `Refresh tracked markets` in the GitHub Actions tab to inspect build and refresh results.

## Coverage and evidence limits

The seller registry includes **18 accounts: 7 owned, 9 price competitors, and 2 variation references**. Every account has a collector configuration. Each scan includes **19 sources: 5 public websites plus 14 eBay seller/store searches**. US Auto Nation has both a website and an eBay source; observations retain the same account classification and separate source identities.

The supplied eBay URLs are mapped to the document's account groups. US Auto Nation's `usautonation` store and the remaining competitor's seller ID `usautoupholstery2014` were verified from public eBay listings. Store slugs are not assumed to equal seller IDs. Unknown or mismatched seller identities are excluded so recommended listings cannot be assigned to your accounts accidentally.

Configured does not mean accessible. eBay can return HTTP 403/429, a sign-in redirect, or a security challenge. The collector stops on those responses, without attempting to bypass them, and records **Blocked by source**. A blocked page never means an empty catalog. Reliable automated access to blocked eBay accounts requires an approved data-access method beyond this public-page implementation. The app does not claim exhaustive internet or marketplace coverage.

Shopify discovery runs a product search and a search for every year in the expanded window, deduplicates product URLs, and checks actual variant pages. Public suggestion limits and safety caps can still truncate discovery. WooCommerce discovery paginates public catalogs and filters all observed years within the window. Source-level limitations/errors remain visible and are stored in every snapshot. The website collector prioritizes fitment inside the requested years before adjacent-year results when a product limit is reached. eBay discovery resolves each store’s public search action to its real seller ID (the storefront search box navigates to `/sch/i.html`), searches the vehicle/product broadly, paginates up to 20 public result pages, and checks every year in the expanded window against observed listing fitment. The first storefront page is retained separately as a clearly labeled bounded sample. If a targeted search is blocked, matching sample listings are retained and coverage stays blocked/partial. Up to 100 item pages are inspected within the 90-second source budget. Saved item links are checked before keyword discovery; an access block stops further requests for that source. Price ranges remain visible for variation research but are excluded from exact-price calculations. Currency comes from each listing's published data, including non-USD prices. The default listing filter shows all currencies, and pricing aggregates require a selected currency.

Source reports distinguish matches, verified no-match results, partial coverage, blocked access, failed searches, and unconfigured sources. Scans run in small batches with a 90-second budget per source. Requests use `redirect: manual`, which is supported by both Cloudflare Workers and Node; this fixes the earlier Analyze Market failure where Workers rejected `redirect: error` before any network request.

Shopify requests explicitly select the US/USD storefront context and verify USD through the public currency endpoint before recording prices. Price-change comparisons require the same collection context. Historical records affected by an earlier unverified currency assumption retain their raw values in `unverifiedPrice`/`unverifiedCurrency`, with prices excluded from analysis; correction commits preserve the audit trail.

Prices are published item prices. Currency conversion, delivery charges, tax, checkout discounts, sales volume, margin, and demand are not inferred. Public feeds do not establish verified best-selling products. Unknown configuration/attributes and reference sellers are excluded from pricing recommendations. Scenarios require at least 3 comparable primary listings from 2 sellers. Catalog gaps mean unobserved in this collected sample, not proven missing from the complete owned catalog.

## Structure

- `lib/market/search.ts`: arbitrary product/year parsing, ±1-year expansion, match rules.
- `lib/market/collectors.ts`: bounded public-store discovery and extraction.
- `lib/market/ebay.ts`: eBay seller-scoped HTML parsing and item-specific enrichment.
- `lib/market/public-http.ts`: bounded, runtime-compatible public requests and access-block detection.
- `app/source-coverage.tsx`: per-account/source outcomes and direct source links.
- `lib/market/model.ts`: seller classification, normalization, exact comparison segments.
- `lib/market/tracking.ts`: snapshot, baseline, notification and due-time rules.
- `lib/market/store.ts`: GitHub shared storage with optimistic concurrency.
- `lib/market/service.ts`: registration, saves, leases, acknowledgement.
- `lib/market/server.ts`: server-only credentials and write access checks.
- `app/api/research`, `app/api/tracking`, `app/api/collect`: application APIs.
- `app/history-view.tsx`: tracked vehicles, notifications and historical observations.
- `scripts/refresh-tracked.ts`: the same collector and comparison code, run by the scheduler.
- `.github/workflows`: automated tests/build and daily market maintenance.

Source pages are untrusted data and are rendered as text. Database/cache files, credentials, dependencies, build outputs, and temporary authoring files are excluded from Git. Tests use synthetic example.com records kept separate from real research.

## Saved products and eBay variations

Expand **Saved product links** below the search field. Choose an account and paste item URLs, one per line. Clean `/itm/<id>` links are sufficient; optional `?var=<id>` is preserved, while tracking parameters are discarded. Links are stored with the tracked search in the shared `market-data` branch and included in both manual and daily scans. Newly discovered eBay items are remembered automatically for subsequent scans. New explicit links are prioritized; remaining links rotate by oldest item check. Unread links stay pending. Last-check timestamps, blocked/failed reads, and product/year mismatches are shown separately from verified observations. No blocked link is converted to a current product price.

Item pages must match both the canonical item ID and the selling account. Published item specifics can establish fitment even if the title omits years. The parser reads public option menus as evidence, without creating a Cartesian product of independent options. When a page publishes JSON-LD `ProductGroup.hasVariant` records with item/variation URLs and exact offers, each exposed combination gets its own stable ID and price. Otherwise, choices remain **options only**, with no exact variation price. Search cards are **unread**, and pages exposing no option selectors are **no options exposed**; neither label promises full catalog coverage. Evidence and coverage labels appear in listing details and exports. Actual eBay pages may use other rendering formats; unsupported or blocked variants remain unresolved.
