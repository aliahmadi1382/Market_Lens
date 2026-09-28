# eBay access decision

Reviewed 28 September 2026. The user chose to retain public-page collection. No eBay API integration or credentials have been added.

## Which API fits?

**Buy Browse API** is the relevant starting point for active listings: seller-filtered keyword searches, pagination, current item offers/aspects, compatibility where supplied, and published variation groups. The useful methods are `item_summary/search`, `getItem`, `getItemByLegacyId`, and `getItemsByItemGroup`. Use server-side application OAuth credentials after obtaining the necessary production access. [Inventory discovery guide](https://developer.ebay.com/develop/guides/buy/inventory-discovery-and-refresh-guide), [seller filters](https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html).

Browse alone does not establish complete marketplace coverage or historical sales rankings. eBay describes Marketplace Insights as a limited-release sales-history API; availability and authorization must be confirmed separately. The Feed API is a possible larger-scale inventory source, subject to approval. [Buying application guide](https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application).

## Permission and suitability

An API key does **not** establish that MarketLens's entire use case is permitted. The current API License Agreement restricts seller-data derivation and certain analytics without written permission. It also governs retention, redistribution, mixed public displays, and freshness: displayed listing information must not exceed six hours of age. A 24-hour-only refresh and indefinitely public Git history need review before adding API data. [API License Agreement, sections 3 and 8](https://developer.ebay.com/join/api-license-agreement).

Ask eBay Developer Support for approval of the actual application, including competitor pricing, variation comparisons, alerts, retention, and public GitHub publication. Follow the production access/Application Growth Check process. Do not treat technical access as legal clearance. [Production approval process](https://developer.ebay.com/develop/get-started/get-started-on-a-buying-application).

## Draft use-case description for eBay's review

MarketLens is a team application for automotive replacement seat covers. It tracks our own sellers and named competing sellers, searches vehicle/model/year ranges, compares active item prices and published material/color/configuration variations, preserves observations, and reports price changes. The current design refreshes every 24 hours and stores research snapshots in a public GitHub repository. We request confirmation of which Browse/other API permissions cover these activities, what written consent is required for competitor analytics, and which changes are required to refresh intervals, historical retention, mixed-source display, and public redistribution. Please confirm production eligibility and applicable limits for this precise use case.

Do not submit credentials, buyer data, or private account records with that description. This document is a technical assessment and approval checklist, not a legal determination.
