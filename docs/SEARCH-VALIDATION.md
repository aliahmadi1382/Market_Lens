# Mercedes-Benz C-Class search regression

Live validation on 28 September 2026 used the same `/api/collect` and `/api/research` routes as Analyze Market, all 19 configured sources, and the existing shared track. Browser inspection was unavailable; this is API and extraction verification.

Input: **Mercedes-Benz C-Class 2015–2021**. Expanded fitment: **2014–2022**.

| Measure | Before | After |
| --- | ---: | ---: |
| Observations (including published variations) | 6 | 329 |
| Distinct products | 6 | 141 |
| Own observations | 6 | 109 |
| Price competitor observations | 0 | 3 |
| Color/material reference observations | 0 | 217 |
| Blocked sources | 14 | 14 |
| Failed sources | 1 | 0 |

The after run contains 227 observations overlapping the requested years and 102 matching only the added boundary years. These counts measure discovered listings/variations, not sales, demand, or complete market coverage.

US Auto Nation's website exposed 103 variations across 18 products; AutoSeatReplacement exposed 3 variations for one product; Richmond exposed 217 observations across 116 products (116 leather and 101 synthetic leather). Six eBay storefront observations remained readable. Targeted eBay searches/item reads returned HTTP 403 and stopped; those stores remain blocked. Texan and The Seat Shop had no matching C-Class items in the public search pages read.

## Causes repaired

- Literal `C-Class` tokens rejected titles using C250/C300/C350. Family discovery now recognizes named submodels while retaining observed body/model distinctions and excluding GLC/GLK mismatches.
- Predictive suggestions could truncate discovery at ten products. Shopify now follows full search pagination, and WooCommerce uses multiple model queries and paginated catalogs.
- The generic product URL expression rejected common single-slug WooCommerce URLs.
- WooCommerce pages can include recommendation variation forms before the real product form. Extraction now verifies product ID, form action, and canonical URL.
- Published variant materials/colors now override a generic parent title. Exact prices remain tied to verified variant records.
- Valid empty catalog responses no longer become failed sources. Same-host canonical redirects and one transient 502/503/504 retry are supported; 401/403/429 and challenges stop collection.

## Reproducible evidence

- Before snapshot: [`efc72847-1cd8-4e4b-8a26-d76f5e660a72`](https://github.com/aliahmadi1382/Market_Lens/blob/market-data/market/snapshots/efc72847-1cd8-4e4b-8a26-d76f5e660a72.json)
- After snapshot: [`b0a359b7-a17f-4a48-b4f6-e85e5d4439ff`](https://github.com/aliahmadi1382/Market_Lens/blob/market-data/market/snapshots/b0a359b7-a17f-4a48-b4f6-e85e5d4439ff.json)
- Shared track: `9eb0a20b-f66d-4b81-aad0-a5464dfcaa19`

The snapshots round-tripped through central storage with all 19 source reports and the same observation counts. The regression suite covers model aliases, false positives, neighboring years, full-search pagination, product-form identity, exact variant attributes, empty-result semantics, partial preservation after blocks, and redirect/retry boundaries. Runtime limits and access restrictions still prevent a guarantee that every product/variant has been discovered.
