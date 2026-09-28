# MarketLens design preferences

The user explicitly prefers a modern glass appearance throughout the application. Preserve this preference in future UI work.

## Reference and adaptation

The supplied `admincn-1.0.0.zip` is the design reference: AdminCN 1.0.0, by shadcn/studio, distributed by ThemeWagon under the MIT license. The original notice is retained in `vendor/admincn/LICENSE.md`.

`components/market/statistics-card.tsx` adapts the archive's `src/views/dashboards/statistics/statistics-card-01.tsx`. The sidebar, compact sticky header, separate statistic cards, and modular dashboard spacing follow the supplied layout. All numbers remain MarketLens research data; the template's demonstration data, promotional scripts, and unrelated application modules are not included.

## Visual language

- Use light frosted surfaces, soft blue / lavender / mint background gradients, subtle white edges, and restrained inset highlights.
- Apply the same glass treatment to navigation, cards, forms, filters, drawers, dialogs, and dropdowns. Keep text, icons, charts, and table values opaque.
- Reuse tokens in `app/glass.css` for surfaces, borders, shadows, text, and blur. `app/globals.css` contains the existing structural layout; the glass stylesheet provides the shared visual layer.
- Keep contrast and dense data legibility ahead of transparency. Avoid blur on individual table rows or decorative motion during research.
- Preserve visible keyboard focus, touch-friendly controls, responsive navigation, horizontally scrollable tables, reduced-motion / transparency support, and an opaque fallback when backdrop filtering is unavailable.

New surfaces should use these conventions so the app remains consistent.
