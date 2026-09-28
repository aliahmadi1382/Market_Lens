# MarketLens

MarketLens is a shared automotive competitor intelligence application. It searches supported public stores, separates your accounts from pricing competitors and material references, preserves historical observations, and tracks price changes every day.

## What this version does

- A request for **Chevy Corvette 2005–2013 searches 2004–2014**, including every intermediate year. A single year searches its previous, current, and next year. Original requested years and actual listing fitment remain distinct.
- Product names are parsed from the query rather than limited to a dropdown of known vehicles. Chevy/Chevrolet aliases and Ford F-150/F150 spellings are normalized. Listings still require matching product terms and observed fitment.
- All first-time searches are registered centrally and automatically tracked. Repeating the same normalized product and requested range uses the same track.
- **Data History** organizes immutable scans under each tracked vehicle/model, provides variant price history, and can reopen previous analyses.
- The sidebar lists all tracked vehicles and unread alert counts. Primary competitor price changes create notifications; a below-our-price alert requires an available own listing observed within 36 hours, with exactly matching configuration, finish, fitment, material, color, currency, and condition.
- Failed, missing, partial, or unpriced observations never turn into zero prices or artificial deletions. Last known observations are retained separately as comparison baselines, not represented as newly collected data.
- Central team acknowledgement, pause/resume tracking, manual refresh, filtering, exact-segment comparisons, normalization, and XLSX export are included.

## Shared storage and daily refresh

Application code lives on `main`. Shared research lives on the **`market-data` branch of this repository**, in `market/index.json` and immutable `market/snapshots/<id>.json` files. The repository and its research data are **public**, as requested. Do not add confidential documents, credentials, customer information, or private costs to this data store.

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

The seller registry includes 18 accounts: 7 owned, 9 price competitors, and 2 variation references. Public collectors are configured for **US Auto Nation, Texan Auto Seat Cover, AutoSeatReplacement, theseatshop, and RichmondAutoUpholstery**. The remaining 13 accounts are identified but do not yet have public collectors. This application does not claim exhaustive internet or marketplace coverage.

Shopify discovery runs a product search and a search for every year in the expanded window, deduplicates product URLs, and checks actual variant pages. Public suggestion limits and safety caps can still truncate discovery. WooCommerce discovery paginates public catalogs and filters all observed years within the window. Source-level limitations/errors remain visible and are stored in every snapshot. Bot restrictions are not bypassed.

Prices are published item prices. Currency conversion, delivery charges, tax, checkout discounts, sales volume, margin, and demand are not inferred. Public feeds do not establish verified best-selling products. Unknown configuration/attributes and reference sellers are excluded from pricing recommendations. Scenarios require at least 3 comparable primary listings from 2 sellers. Catalog gaps mean unobserved in this collected sample, not proven missing from the complete owned catalog.

## Structure

- `lib/market/search.ts`: arbitrary product/year parsing, ±1-year expansion, match rules.
- `lib/market/collectors.ts`: bounded public-store discovery and extraction.
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
