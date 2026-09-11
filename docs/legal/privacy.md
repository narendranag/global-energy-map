# Privacy

**Effective 11 September 2026.** This policy covers the Global Energy Map at [energymap.marain.space](https://energymap.marain.space). The site is built and run by [Narendra Nag](https://narendranag.com) as a project of [Marain](https://marain.space), his operator's practice. Marain's own site has [its own privacy policy](https://marain.space/privacy).

## The short version

- There are no accounts, no sign-up, no forms and no cookies.
- We count page views with Vercel Web Analytics, which is cookieless and reports aggregate traffic, not individuals.
- Your browser fetches map tiles from OpenFreeMap, a third party, which sees your IP address like any web server does.
- The map remembers one thing on your device: that you closed the intro card.
- Everything you do on the map (filtering, scenarios, exports) runs in your browser. Nothing you select is sent to us.

## What is collected, by whom, and why

### Hosting (Vercel)

The site is hosted on [Vercel](https://vercel.com). Like any web host, Vercel's servers receive each request, with your IP address, browser user agent, the page or file requested and the time, and keep operational logs to deliver the site and protect it from abuse. We do not combine these logs with anything else or use them to identify visitors. Vercel's handling is described in its [privacy policy](https://vercel.com/legal/privacy-policy).

### Analytics (Vercel Web Analytics)

We use [Vercel Web Analytics](https://vercel.com/docs/analytics/privacy-policy) to see which pages and views are used, so we know what to improve. It records page views with the page path, the referring site, and the country, browser, operating system and device type derived from the request. It sets no cookies and does not track you across sites. Vercel states that it recognises a visit with a hash derived from the request, which it discards within 24 hours, so we cannot follow an individual over time. We only see aggregate counts.

The analytics script is served from this site's own domain. Browsers and extensions that block it do not affect how the map works.

### Basemap tiles (OpenFreeMap)

The background map (coastlines, place names, roads) comes from [OpenFreeMap](https://openfreemap.org). Your browser requests these tiles and fonts directly from `tiles.openfreemap.org`, so OpenFreeMap receives your IP address, user agent and the map area you are viewing, as any tile server would. This is the only third-party service the page contacts. Its use of that data is governed by OpenFreeMap's own terms.

### Data files and fonts

All other files, including the energy datasets, the map's code and its fonts, are served from this site. There are no advertising, social-media or tag-manager scripts.

## What stays on your device

- **Intro card.** When you close the "What this map can answer" card, the site stores `gem.intro.dismissed.v1 = 1` in your browser's local storage so it does not reappear. Clearing your browser's site data removes it.
- **Map state in the address bar.** The current view (mode, layers, year, scenario, map position) is written into the page URL so you can bookmark or share it. A shared link contains only these view settings.
- **Exports and citations.** CSV, GeoJSON and citation files are generated in your browser and saved straight to your device. "Copy link" and "Copy citation" only write to your clipboard when you click them.

## Reporting a problem

If the map hits an error, the error panel offers a **Report an issue** link. It opens a pre-filled GitHub issue containing the error message, the page URL and your browser's user agent. Nothing is sent unless you choose to submit that issue on GitHub, which is then public and covered by [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Links to other sites

The map and its pages link to data publishers, documentation and GitHub. Those sites have their own privacy practices, which this policy does not cover.

## Your choices and rights

Because the site holds no accounts or profiles, there is normally nothing we can look up about you. Depending on where you live, you may have rights to access, correct or delete personal data, or to object to its processing. To ask about any of this, or about Vercel's analytics or logs as they relate to this site, email [privacy.officer@marain.space](mailto:privacy.officer@marain.space). We process the limited data above because we have a legitimate interest in running, securing and improving a free public research tool. The site is operated from Singapore, and we handle personal data in line with Singapore's Personal Data Protection Act 2012; privacy.officer@marain.space is the contact for data protection matters.

The site is intended for researchers and the general public, and is not directed at children.

## Changes

If what the site collects changes, this page will be updated first, with a new effective date. Every past version is in the project's [public history on GitHub](https://github.com/narendranag/global-energy-map/commits/main/docs/legal/privacy.md).

## Contact

- Privacy questions: [privacy.officer@marain.space](mailto:privacy.officer@marain.space)
- Everything else: [info@marain.space](mailto:info@marain.space) or [GitHub issues](https://github.com/narendranag/global-energy-map/issues)
