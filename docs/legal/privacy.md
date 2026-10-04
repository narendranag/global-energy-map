# Privacy

**Effective 27 September 2026.** This policy covers the Global Energy Map at [energymap.marain.space](https://energymap.marain.space). The site is built and run by [Narendra Nag](https://narendranag.com) as a project of [Marain](https://marain.space), his operator's practice. Marain's own site has [its own privacy policy](https://marain.space/privacy).

## The short version

- There are no accounts, no sign-up and no forms.
- We count visits with two analytics tools: Vercel Web Analytics, which is cookieless, and Google Analytics, which sets first-party cookies only if you press Allow on the cookie banner. We see aggregate reports, not individuals.
- Google Analytics never receives the SQL you write in the query console.
- Your browser fetches map tiles from OpenFreeMap, a third party, which sees your IP address like any web server does.
- The map remembers one thing on your device: that you closed the intro card.
- Everything you do on the map (filtering, scenarios, exports) runs in your browser. Nothing you select is sent to us.
- The query console at `/query` is the same: the database engine and the data are downloaded to your browser, and your SQL is never sent anywhere.

## What is collected, by whom, and why

### Hosting (Vercel)

The site is hosted on [Vercel](https://vercel.com). Like any web host, Vercel's servers receive each request, with your IP address, browser user agent, the page or file requested and the time, and keep operational logs to deliver the site and protect it from abuse. We do not combine these logs with anything else or use them to identify visitors. Vercel's handling is described in its [privacy policy](https://vercel.com/legal/privacy-policy).

### Analytics (Vercel Web Analytics)

We use [Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy) to see which pages and views are used, so we know what to improve. It records page views with the page path, the referring site, and the country, browser, operating system and device type derived from the request. It sets no cookies and does not track you across sites. Vercel states that it recognises a visit with a hash derived from the request, which it discards within 24 hours, so we cannot follow an individual over time. We only see aggregate counts.

The analytics script is served from this site's own domain. Browsers and extensions that block it do not affect how the map works.

### Analytics (Google Analytics)

We also use [Google Analytics 4](https://support.google.com/analytics/answer/6004245), from Google, to understand how people find and use the map: which pages and scenarios are opened, how visitors arrive, and how they scroll and click through to other sites. Your browser loads Google's script from `www.googletagmanager.com` (Google Tag Manager, which starts Google Analytics) and sends these events to Google's servers (`google-analytics.com`), with your IP address, browser and device details, the page address and the referring site. Google Analytics does not log or store IP addresses, and derives only an approximate location from them.

Google Analytics sets no cookies until you allow it. The first time you visit, a banner asks; until you press **Allow**, Google Tag Manager runs with analytics storage denied, and if you press **Decline** it stays that way. You can change your mind at any time with **Cookie settings** in the page footer, which asks again. Once you allow it, Google Analytics sets first-party cookies named `_ga` and `_ga_YMXRSFHM6R` on this site. They hold a random identifier so that repeat visits can be counted, and they expire after two years. They are not used for advertising: Google signals and ads personalisation are not enabled, and the data is not linked to any Google Ads account.

Two limits protect what the map does in your browser:

- A few actions are reported as events, each with a short label and nothing you typed: opening a scenario (its name), selecting a country (its code), picking a search result (the result's name, not the text typed), downloading a file (its name), and copying the link, embed code or citation (which one).
- The map's address bar holds your view settings (mode, layers, year, scenario). A page view reports the address when you arrive on a page, so Google Analytics can see which scenario you opened. It never sees anything you type.
- The query console writes your SQL into its address. If you open `/query` directly, Google Analytics is not loaded at all. If you reach it from the map, the visit is reported as `/query` with everything after the `?` removed, so your SQL is never sent.

Google processes this data under its [privacy policy](https://policies.google.com/privacy) and may do so on servers outside Singapore, including in the United States. You can also block Google Analytics with any content blocker or with Google's [opt-out browser add-on](https://tools.google.com/dlpage/gaoptout), and the map works the same without it.

### Basemap tiles (OpenFreeMap)

The background map (coastlines, place names, roads) comes from [OpenFreeMap](https://openfreemap.org). Your browser requests these tiles and fonts directly from `tiles.openfreemap.org`, so OpenFreeMap receives your IP address, user agent and the map area you are viewing, as any tile server would. Apart from Google Analytics, described above, it is the only third-party service the page contacts. Its use of that data is governed by OpenFreeMap's own terms.

### Data files and fonts

All other files, including the energy datasets, the map's code and its fonts, are served from this site. There are no advertising or social-media scripts; the one script from another site is Google Tag Manager, which loads Google Analytics.

### Query console (`/query`)

The query console runs [DuckDB](https://duckdb.org) compiled to WebAssembly **inside your browser**. The engine, its extensions and the data files it reads are all served from this site — there is no query server, and the console itself contacts no third party (Google Analytics only counts the visit, as described above, and never sees your SQL). Your SQL is executed locally, is not logged anywhere, and is never transmitted; it is written into the page's address bar so you can share or bookmark it, which happens on your device. A CSV you export is generated in your browser, as with every other export below.

## What stays on your device

- **Analytics choice and cookies.** Your Allow or Decline answer, stored as `consent` in local storage, and, only if you allowed it, Google Analytics' `_ga` and `_ga_YMXRSFHM6R` cookies, described above. Clearing your browser's cookies for this site removes them.

- **Intro card.** When you close the "What this map can answer" card, the site stores `gem.intro.dismissed.v1 = 1` in your browser's local storage so it does not reappear. Clearing your browser's site data removes it.
- **Map state in the address bar.** The current view (mode, layers, year, scenario, map position) is written into the page URL so you can bookmark or share it. A shared link contains only these view settings.
- **Exports and citations.** CSV, GeoJSON and citation files are generated in your browser and saved straight to your device. "Copy link" and "Copy citation" only write to your clipboard when you click them.

## Reporting a problem

If the map hits an error, the error panel offers a **Report an issue** link. It opens a pre-filled GitHub issue containing the error message, the page URL and your browser's user agent. Nothing is sent unless you choose to submit that issue on GitHub, which is then public and covered by [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Embedding

The map can be embedded on third-party sites in an `<iframe>` (`?embed=1`). An embedded map behaves exactly as described above — no accounts, the same Vercel Web Analytics and Google Analytics counting and the same OpenFreeMap tile requests — nothing changes about what is collected because the map is inside someone else's page. That page has its own privacy policy, which is not covered here; if you have concerns about a specific site that embeds the map, contact that site.

## Links to other sites

The map and its pages link to data publishers, documentation and GitHub. Those sites have their own privacy practices, which this policy does not cover.

## Your choices and rights

Because the site holds no accounts or profiles, there is normally nothing we can look up about you. Depending on where you live, you may have rights to access, correct or delete personal data, or to object to its processing. To ask about any of this, or about Vercel's or Google's analytics or logs as they relate to this site, email [privacy.officer@marain.space](mailto:privacy.officer@marain.space). We process the limited data above because we have a legitimate interest in running, securing and improving a free public research tool. The site is operated from Singapore, and we handle personal data in line with Singapore's Personal Data Protection Act 2012; privacy.officer@marain.space is the contact for data protection matters.

The site is intended for researchers and the general public, and is not directed at children.

## Changes

If what the site collects changes, this page will be updated first, with a new effective date. Every past version is in the project's [public history on GitHub](https://github.com/narendranag/global-energy-map/commits/main/docs/legal/privacy.md).

## Contact

- Privacy questions: [privacy.officer@marain.space](mailto:privacy.officer@marain.space)
- Everything else: [info@marain.space](mailto:info@marain.space) or [GitHub issues](https://github.com/narendranag/global-energy-map/issues)
