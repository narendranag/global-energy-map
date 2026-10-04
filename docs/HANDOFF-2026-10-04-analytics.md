# Hand-off — take GA4 + Tag Manager live on energymap.marain.space

From the fleet session on 2026-10-04 (claude-computer). Read this, then `analytics.yaml`, then the "Analytics" section of `~/claude-computer/docs/DEV-GUIDELINES.md`.

## Where things stand

- **GA4:** the existing property `properties/556124311` ("Global Energy Map"), web stream `G-YMXRSFHM6R` (the one the site already loads). New on 2026-10-04: custom dimensions `download_kind`, `scenario`, `method` and `country_iso3`; key events `file_download` and `select_content`.
- **Tag Manager:** new web container **`GTM-PT8ZNQ7Z`** ("Global Energy Map", account NarendraNag). It holds the Google tag (`G-YMXRSFHM6R`, all pages), a data-layer variable per parameter, and a trigger plus a GA4 event tag for each of `page_view`, `file_download`, `select_content`, `share`, `search` and `view_item`. **Version 2 is saved and NOT published.**
- **`analytics.yaml`** (repo root) is the source of truth and holds every ID. `analytics sync` is idempotent: a second run changed nothing. (Tag Manager's per-minute quota can answer 429 during a first sync; wait a minute and run it again.)
- **`main` still loads gtag.js directly** (`src/components/analytics/GoogleAnalytics.tsx`). Branch `analytics-gtm` replaces it.

## What is on the branch `analytics-gtm`

- `GoogleAnalytics.tsx` is gone; `src/components/analytics/GoogleTagManager.tsx` loads the container with the standard snippet. Both old guards are kept: production host only, and never for a visit that starts on `/query`. After the first page it sends a `page_view` per pathname (with `/query` stripped of its query string), exactly as before; the Google tag sends the first one.
- There is **no `<noscript>` iframe**: it cannot honour those two guards, and the map needs JavaScript anyway.
- `src/components/analytics/track.ts` is the one way to push events (`track(name, params)`); it does nothing on previews, in dev, in e2e, or on `/query`. Events and where they fire:
  - `file_download` (key): Share / cite downloads (scenario table, layer CSV or GeoJSON) and the Download links on `/data`.
  - `select_content` (key): picking a scenario, from the picker or an example question (not a scenario that arrives in a shared link).
  - `share`: copying the link, the embed code or the citation.
  - `search`: picking a search result (`search_term` is the result's name, never the typed text).
  - `view_item`: selecting a country (map click, search, ranked row).
- Not added: outbound clicks and scrolls (GA's enhanced measurement already sends them, and a second event would count twice); `generate_lead` (there is no sign-up or contact form).
- `docs/legal/privacy.md` now says Google Tag Manager loads Google Analytics and lists what the events carry. Vercel Web Analytics is untouched.

## What to do, in order

1. **Consent — done: banner.** `ConsentBanner` and Consent Mode (default `denied` for everyone, set in `GoogleTagManager.tsx` before the container loads; a stored choice in localStorage `consent` is replayed). Allow/Decline call `gtag('consent', 'update', …)`; "Cookie settings" in the footers asks again. No banner on /query, previews, dev or in `?embed=1`.
2. **Test locally, then in GTM Preview:** the container only loads on `energymap.marain.space`, so for Preview temporarily set `PRODUCTION_HOST` to `localhost` in `GoogleTagManager.tsx` (do not commit it), run `pnpm dev`, then GTM → Preview → connect to `http://localhost:3000`. Use a scenario, a download, a share copy, a search and a country click; check each GA4 tag fires with its parameters. Then GA → Admin → DebugView.
3. **Merge** `analytics-gtm` into `main` (ask Narendra).
4. **Deploy:** Vercel deploys every push to `main`.
5. **Publish the container — ask Narendra first, every time:** `analytics publish`. An unpublished container sends nothing, so once step 4 is live GA receives **no data at all** until this runs. Get his yes before the merge, then publish straight after the deploy.
6. **Reports:** the Google Analytics **Data API** must be enabled in the Cloud project `claude-computer-acccess` (Narendra's step: APIs & Services → Library). Then `analytics report acquisition`, `landing-pages`, `downloads`, `scenarios`, and `analytics funnel explore`.

## Rules

- `analytics publish` changes what the live site sends to Google: ask every time.
- GA gets marketing events only. Never put anything a visitor typed in a parameter; `/query`'s SQL must never reach Google.
- Change events in `analytics.yaml` first, then `analytics sync`, then the site code.
