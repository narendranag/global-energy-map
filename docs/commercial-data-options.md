# Commercial data options for a paid, up-to-date version

> **Status:** research note, 2026-09-17. No commitment, no vendor contacted.
> **Question asked:** if we built a commercial version of this site on paid, current data, which sources would we use and what would it cost?
> **Short answer:** the subscription fee is not the main cost. The redistribution licence is, and it is the thing that decides whether the product can stay public at all.

## 1. The licensing wall comes first

Every layer we ship today is CC BY 4.0, public domain, or Etalab Open Licence 2.0. That is what lets `/data` offer downloads and lets the map be public at all (`LICENSE-DATA.md` is the decision record). Commercial energy data inverts this assumption.

- **S&P Global Platts** — subscribers may not create derivative works, and may not "publish, display, reproduce, distribute, disclose or otherwise make available" the information externally without an additional licence. Redistribution is permitted only as limited extracts that are *not regularly updated*, are incidental to the subscriber's business, cannot substitute for the original, and are *not charged for*. That is a precise description of the opposite of this product. Derived pricing data requires a separately signed Derived Data agreement.
- **Argus Media** — licensees may not redistribute licensed data, and may not distribute, redistribute or sell *derived* data to any party.
- **CME and the exchanges** — market data may not be used to create derived products that are disseminated, published, or used externally.

The consequence is structural, not commercial. A public, always-current map built on this data is not a subscription you buy; it is a **redistribution / display licence you negotiate**. Those are typically priced at a large multiple of the internal-seat rate, scaled to your end-user count, and often carry a revenue share. Assume **2–3× the headline figures in §2**, and assume a procurement cycle measured in months.

This forces a product decision before any budgeting:

| Option | What it means | Licence posture |
|---|---|---|
| **Gated** | Login, per-seat, named users. We become a licensed redistributor. | Negotiable, expensive, auditable seat counts |
| **Public + derived** | The map stays open. We sell our *analysis* — the scenario engine, exposure attribution — not the underlying data. | Sourced only from data we may legally display |

The second option preserves what currently makes the site distinctive. It also happens to be the cheaper one.

## 2. Vendor landscape by layer

| Layer | What we ship today | Commercial equivalent | Cost (annual) | Confidence |
|---|---|---|---|---|
| LNG voyages / flows | LNG-T3, 2020–24, static | **Kpler**, Vortexa, ICIS LNG Edge | Kpler median **$55k**, range **$50–73.8k**; enterprise into low six figures. Vortexa listed at **>$10k/month** | Published third-party figures |
| Vessel positions / AIS | none | **Kpler** | Bundled. Cheaper shallow alternatives exist (Datalastic, Sentinel) | Published |
| Reserves + production | EI Statistical Review; reserves frozen after 2020 | **Rystad UCube**, Wood Mackenzie Lens, S&P Upstream | Quote-only. Commonly cited in the **$50–150k+** band | **Unverified — directional only** |
| Extraction sites | GEM GOGET | Rystad, Enverus, S&P | Usually bundled with the above | Unverified |
| Refineries | NETL + OSM; capacity for 350 of 1,163 | S&P (OGJ refinery survey), WoodMac, Argus | Quote-only | Unverified |
| Pipelines | GEM GOIT / GGIT | S&P, WoodMac | Quote-only | Unverified |
| Trade flows | BACI, annual, ~2-year lag | Kpler / Vortexa real-time | Bundled | — |
| Chokepoint scenarios | EIA / IEA, cited per row | No vendor sells this | — | Analyst judgement; ours already |

Only the Kpler and Vortexa numbers come from published sources. Everything else is quote-only, and any precise figure quoted without a sales conversation is a guess.

## 3. Vendor concentration risk

**Kpler now owns MarineTraffic, FleetMon, and Spire Maritime.** The entire vessel-tracking and satellite-AIS layer has consolidated into one counterparty. There is no meaningful second source for cargo-level LNG and crude flow tracking at comparable quality, which means:

- no competitive tension at renewal;
- a single point of failure for the layer that would most differentiate a paid product;
- pricing power that trends the wrong way over a multi-year contract.

This should be weighted heavily against the "add vessel intelligence" scenario below.

## 4. Budget scenarios

**A — Fresh and legal: $0–15k/yr.**
Free sources with redistribution rights intact (GIE AGSI/ALSI, ENTSOG, EIA, UN Comtrade, GEM refreshes). Closes most of the *staleness* gap, which is our real credibility problem. No vessel-level detail. Stays public, stays CC-compatible, no negotiation. Planned in `docs/superpowers/plans/2026-09-17-data-freshness-upgrade.md`.

**B — Add vessel intelligence: $100–300k/yr realistic.**
Kpler or Vortexa at $50–150k, times the redistribution multiplier. Requires gating the product. This is the step that turns a side project into a company with a procurement function and an annual renewal risk concentrated in one vendor.

**C — Full commercial parity: $300k–1M+/yr.**
Kpler plus Rystad or WoodMac plus a price feed. At this point we are competing with those vendors' own dashboards, using their data, under their licence terms.

## 5. Assessment

Scenario A is underexploited and should happen regardless of any commercial ambition — it is the cheapest available improvement to the product's credibility.

Scenario B only makes sense once there are paying users who specifically want cargo-level flows, because the licence terms require giving up the public-access property that distinguishes the site. The differentiator we own — the scenario engine and its exposure attribution — does not improve with more expensive inputs. It improves with better attribution logic, which is free to work on.

If we do approach vendors, the questions that determine the real price are not about coverage or refresh rate. They are:

1. What exactly may be displayed to an unauthenticated public user?
2. Is derived output (our scenario results, aggregates, exposure percentages) redistributable, and under what separate agreement?
3. How is the licence priced — seats, MAU, page views, or revenue share?
4. What happens to cached and previously published derived output on termination?
5. Audit rights and what they require us to log.

## Sources

- [Kpler pricing — Vendr](https://www.vendr.com/marketplace/kpler)
- [Kpler — Datarade profile](https://datarade.ai/data-providers/kpler/profile)
- [Vortexa — AlternativeData](https://alternativedata.org/data_provider/vortexa/)
- [AIS data providers compared — Sentinel](https://usesentinel.io/blog/ais-data-providers-comparison)
- [MarineTraffic cost 2025 — Tradlinx](https://blogs.tradlinx.com/how-much-does-marinetraffic-cost-2025-and-what-are-you-really-getting/)
- [Platts Collateral License Agreement](https://thesource.lseg.com/TheSource/getfile/download/e3d080ed-d306-49f3-9ad9-adcefd3aca00)
- [Argus Media exchange / derived-data terms](https://www.argusmedia.com/en/policies/exchange-terms)
- [CME Market Data License Agreement](https://www.thomsonreuters.com/content/dam/ewp-m/documents/thomsonreuters/en/pdf/third-party-restrictions/cme-mdla-schedule-7.pdf)
- [GIE AGSI/ALSI transparency platforms](https://www.gie.eu/agsi-and-alsi-transparency-platforms/)
