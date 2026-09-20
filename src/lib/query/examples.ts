/**
 * Starting points for the console, drawn from `docs/researchers/worked-examples.md`.
 *
 * Every one was run against the shipped Parquet files and reproduces the
 * numbers in that document — the Hormuz and Druzhba queries return the same
 * at-risk figures the scenario panel does, so a researcher can check the
 * app's arithmetic against their own. They are examples, not the engine: the
 * scenario engine stays a pure TypeScript module (CLAUDE.md), and these
 * queries deliberately cover only the parts of it that are plain SQL.
 */

export interface ExampleQuery {
  readonly id: string;
  readonly title: string;
  /** What the result answers, and what to be careful of. */
  readonly note: string;
  readonly sql: string;
}

export const EXAMPLE_QUERIES: readonly ExampleQuery[] = [
  {
    id: "crude-importers",
    title: "Largest crude importers, 2024",
    note: "BACI tonnes at 7.33 barrels per tonne, as annual-average kb/d — the denominator every scenario percentage uses.",
    sql: `-- Who buys the most crude? (BACI, HS 2709)
SELECT importer_iso3,
       round(sum(qty) * 7.33 / 365 / 1000, 1) AS crude_imports_kbpd
FROM trade_flow
WHERE hs_code = '2709' AND year = 2024
GROUP BY importer_iso3
ORDER BY crude_imports_kbpd DESC
LIMIT 15`,
  },
  {
    id: "hormuz",
    title: "Crude at risk if Hormuz closes, 2024",
    note: "Reproduces the scenario panel: a pair share overrides the exporter-wide row, including the intra-Gulf pairs set to 0. Iranian crude is near-absent from BACI, so buyers of it are understated.",
    sql: `-- Hormuz exposure by importer (worked example 2)
WITH route AS (
  SELECT exporter_iso3, importer_iso3, share
  FROM disruption_route
  WHERE disruption_id = 'hormuz'
),
exposed AS (
  SELECT f.importer_iso3,
         f.qty AS qty,
         -- A pair row wins over the exporter-wide row (importer_iso3 IS NULL).
         f.qty * coalesce(pair.share, wildcard.share, 0) AS at_risk
  FROM trade_flow f
  LEFT JOIN route pair
    ON pair.exporter_iso3 = f.exporter_iso3
   AND pair.importer_iso3 = f.importer_iso3
  LEFT JOIN route wildcard
    ON wildcard.exporter_iso3 = f.exporter_iso3
   AND wildcard.importer_iso3 IS NULL
  WHERE f.hs_code = '2709' AND f.year = 2024
)
SELECT importer_iso3,
       round(sum(at_risk) * 7.33 / 365 / 1000, 0) AS at_risk_kbpd,
       round(sum(qty) * 7.33 / 365 / 1000, 0) AS total_kbpd,
       round(100 * sum(at_risk) / sum(qty), 1) AS pct_at_risk
FROM exposed
GROUP BY importer_iso3
HAVING sum(at_risk) > 0
ORDER BY at_risk_kbpd DESC
LIMIT 15`,
  },
  {
    id: "druzhba",
    title: "Central Europe's Druzhba exposure, 2022",
    note: "Only pairs with a Druzhba share are counted. Belarus is absent: BACI records no Russia → Belarus crude from 2022 on. Try year 2021 to see it.",
    sql: `-- Druzhba exposure by importer (worked example 1)
WITH route AS (
  SELECT exporter_iso3, importer_iso3, share
  FROM disruption_route
  WHERE disruption_id = 'druzhba'
)
SELECT f.importer_iso3,
       round(sum(f.qty * r.share) * 7.33 / 365 / 1000, 0) AS at_risk_kbpd,
       round(100 * sum(f.qty * r.share) / sum(f.qty), 1) AS pct_of_russian_crude
FROM trade_flow f
JOIN route r
  ON r.exporter_iso3 = f.exporter_iso3
 AND r.importer_iso3 = f.importer_iso3
WHERE f.hs_code = '2709' AND f.year = 2022
GROUP BY f.importer_iso3
ORDER BY at_risk_kbpd DESC`,
  },
  {
    id: "qatar-lng",
    title: "Where Qatar's LNG went in 2023 — voyages vs BACI",
    note: "LNG-T3 voyages are a sample of routes, not a measure of volume: compare the two right-hand columns before using either. A voyage crossing a year boundary counts in both years.",
    sql: `-- Qatari LNG: observed voyages beside recorded trade (worked example 5)
WITH voyages AS (
  SELECT to_country_iso3,
         count(*) AS voyages,
         round(sum(amount_cbm) * 0.4245 / 1e6, 1) AS voyage_mt
  FROM lng_voyage
  WHERE from_country_iso3 = 'QAT'
    AND voyage_type = 'export'
    AND confidence_score >= 3
    AND start_date <= DATE '2023-12-31'
    AND end_date >= DATE '2023-01-01'
  GROUP BY to_country_iso3
),
baci AS (
  SELECT importer_iso3, round(sum(qty) / 1e6, 1) AS baci_mt
  FROM trade_flow
  WHERE hs_code = '271111' AND year = 2023 AND exporter_iso3 = 'QAT'
  GROUP BY importer_iso3
)
SELECT v.to_country_iso3 AS destination, v.voyages, v.voyage_mt, b.baci_mt
FROM voyages v
LEFT JOIN baci b ON b.importer_iso3 = v.to_country_iso3
ORDER BY v.voyage_mt DESC
LIMIT 12`,
  },
  {
    id: "permian",
    title: "Permian production, 2009 onward",
    note: "EIA's Short-Term Energy Outlook history only (forecast years are dropped at build). The regions are EIA's county sets, not geology.",
    sql: `-- US shale: one region's crude and marketed gas by year
SELECT year,
       round(sum(CASE WHEN metric = 'crude_production_kbpd' THEN value END), 0) AS crude_kbpd,
       round(sum(CASE WHEN metric = 'gas_marketed_bcfd' THEN value END), 1) AS gas_bcfd
FROM shale_region_year
WHERE region_id = 'permian'
GROUP BY year
ORDER BY year`,
  },
  {
    id: "gie-storage",
    title: "European gas storage, winter 2025 (view-only)",
    note: "Gas Infrastructure Europe data is free but not openly licensed, so this result can be read here and not saved as a file — the console will say so if you try.",
    sql: `-- How low did each country's gas storage go? (GIE AGSI, daily)
SELECT iso3,
       round(avg(value), 1) AS avg_full_pct,
       min(value) AS min_full_pct
FROM gie_daily
WHERE metric = 'gas_storage_full_pct'
  AND gas_day BETWEEN DATE '2025-01-01' AND DATE '2025-03-31'
GROUP BY iso3
ORDER BY min_full_pct
LIMIT 15`,
  },
];

export const DEFAULT_QUERY = EXAMPLE_QUERIES[0]?.sql ?? "SELECT 1";
