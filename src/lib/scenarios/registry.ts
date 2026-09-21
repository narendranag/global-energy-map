import type { Commodity, ScenarioId } from "./types";
// Type-only, deliberately: `vintage.ts` reaches `export/layers.ts`, which
// imports SCENARIOS from this file. A value import here would close that
// cycle, so the two-line span format below is local rather than shared.
import type { RouteYears } from "./vintage";
import { LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR } from "@/lib/data-catalog/years";

export interface ScenarioDef {
  readonly id: ScenarioId;
  readonly label: string;
  readonly kind: "chokepoint" | "pipeline";
  readonly commodities: readonly Commodity[];
  readonly description: string;
  /** Commodity-specific description; falls back to `description`. */
  readonly descriptionByCommodity?: Partial<Record<Commodity, string>>;
  /** Used in metric definitions: "… routed through {routeName}". */
  readonly routeName: string;
  /** A known BACI gap that understates the scenario from `fromYear` on (oil axis). */
  readonly sourceGap?: { readonly fromYear: number; readonly text: string };
  /** Chokepoint marker, for the map overlay (S1). Verified lon/lat, not a bounding box. */
  readonly location?: { readonly lon: number; readonly lat: number };
  /** `pipelines.geojson` `pipeline_id`s that make up this route, for map highlighting (S1). */
  readonly pipelineIds?: readonly string[];
  /**
   * The years this scenario's share is meant to describe. Unset = the share
   * holds for every trade year we hold, which is true of every scenario
   * shipped today. Not yet consumed by any shipped scenario — added for a
   * future year-bounded route (e.g. Kirkuk-Ceyhan, held pending this).
   */
  readonly activeYears?: { readonly from?: number; readonly to?: number };
  /**
   * Shown in place of the scenario's numbers when the trade year the result
   * runs on falls outside `activeYears`.
   *
   * Nobody picks that year any more: it is the latest reconciled trade year
   * unless a link pins an earlier one. So this note explains why a scenario
   * cannot be computed on the year the site *has* trade for — not a year the
   * reader chose — and it is the place to say what the reader should do about
   * it. No shipped scenario sets `activeYears`, so nothing renders it today;
   * a scenario that needs it should say which years it describes and why.
   */
  readonly inactiveNote?: string;
}

/** True when `year` falls inside `def.activeYears` (always true if unset). */
export function isScenarioActive(def: ScenarioDef, year: number): boolean {
  const range = def.activeYears;
  if (range === undefined) return true;
  if (range.from !== undefined && year < range.from) return false;
  if (range.to !== undefined && year > range.to) return false;
  return true;
}

export function scenarioDescription(def: ScenarioDef, commodity: Commodity): string {
  return def.descriptionByCommodity?.[commodity] ?? def.description;
}

/** The scenario's source-gap warning if it applies to (commodity, year), else null. */
export function sourceGapNote(def: ScenarioDef, commodity: Commodity, year: number): string | null {
  const gap = def.sourceGap;
  return gap !== undefined && commodity === "oil" && year >= gap.fromYear ? gap.text : null;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "hormuz",
    label: "Close Strait of Hormuz",
    kind: "chokepoint",
    commodities: ["oil", "gas"],
    description:
      "Strait between the Persian Gulf and the Gulf of Oman; about 20% of global oil traded by sea transits here. Closure stops nearly all crude exports from Iran, Iraq, Kuwait, Qatar, Bahrain and most from Saudi Arabia and UAE (some bypass via East-West and Fujairah).",
    descriptionByCommodity: {
      gas: "Strait between the Persian Gulf and the Gulf of Oman. All LNG exported from Qatar and the UAE (Das Island) — roughly 20% of global LNG trade — must transit here; unlike crude, there is no pipeline bypass for LNG cargoes.",
    },
    routeName: "the Strait of Hormuz",
    // Narrowest point of the strait, between Oman's Musandam peninsula and
    // Iran's Bandar-e Lengeh coast (EIA's World Oil Transit Chokepoints puts
    // the shipping lanes here; the inbound and outbound lanes are 2 miles
    // wide each). Every other chokepoint scenario carries the same field.
    location: { lon: 56.25, lat: 26.57 },
    sourceGap: {
      fromYear: 2019,
      text: "BACI records little Iranian crude from 2019 (about 4 Mt in 2020–21, near zero in 2023–24) while sanctioned cargoes are relabelled, e.g. as Malaysian. Exposure of Iran's buyers, China above all, is understated.",
    },
  },
  {
    id: "druzhba",
    label: "Cut Druzhba pipeline",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Soviet-era pipeline carrying Russian crude to Belarus, Poland, Germany (mostly halted 2023), Slovakia, Hungary, and Czechia. Southern branch remains active under EU sanctions exemptions.",
    routeName: "the Druzhba pipeline",
    sourceGap: {
      fromYear: 2022,
      text: "BACI records no Russian crude into Belarus from 2022 (16 Mt in 2021), so Belarus, Druzhba's largest single buyer, drops out of the results from 2022.",
    },
    // Verifier (oil-pipelines.md, Part B): 17 features, not the 15 the
    // original research note listed — P6307/P7280 were missing.
    pipelineIds: [
      "P0653", "P5133", "P5134", "P5137", "P5146", "P5188", "P5189", "P5190",
      "P5207", "P5322", "P5323", "P5324", "P5326", "P5327", "P5329", "P6307",
      "P7280",
    ],
  },
  {
    id: "btc",
    label: "Cut Baku-Tbilisi-Ceyhan",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Carries about 83% of Azerbaijan's oil exports from the Caspian to the Mediterranean via Georgia and Turkey, bypassing Russia and the Bosporus.",
    routeName: "the Baku-Tbilisi-Ceyhan pipeline",
    pipelineIds: ["P0644"],
  },
  {
    id: "cpc",
    label: "Cut Caspian Pipeline Consortium",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Moves about 80% of Kazakhstan's crude exports (plus a small Russian volume, ~3.5% of Russia's crude exports) to Novorossiysk on the Black Sea. Has been disrupted multiple times by Russian regulatory and infrastructure decisions.",
    routeName: "the CPC pipeline",
    pipelineIds: ["P0646"],
  },
  {
    id: "malacca",
    label: "Close Strait of Malacca",
    kind: "chokepoint",
    commodities: ["oil", "gas"],
    description:
      "Strait between Sumatra and the Malay Peninsula: the only realistic sea route between Persian Gulf suppliers and East Asia. About 16.6 million b/d of crude transited in 1H2025, nearly 60% of it from Saudi Arabia, the UAE, Kuwait and Iraq (EIA/Bernama). Gulf crude to India crosses the Arabian Sea directly and never reaches the strait.",
    descriptionByCommodity: {
      gas: "Strait between Sumatra and the Malay Peninsula: Qatari LNG bound for Japan, South Korea, China and Taiwan transits here; LNG to South Asia does not.",
    },
    routeName: "the Strait of Malacca",
    location: { lon: 103.6, lat: 1.16 },
    sourceGap: {
      fromYear: 2019,
      text: "EIA/Bernama put Iranian crude transiting Malacca at about 1.6 million b/d in 1H2025, headed largely to China - the largest single exporter this scenario omits. BACI shows near-zero Iranian crude to China (China does not declare it), so Iran's exposure here is a known omission, same as on Hormuz.",
    },
  },
  {
    id: "suez",
    label: "Close Suez Canal + SUMED",
    kind: "chokepoint",
    commodities: ["oil", "gas"],
    description:
      "Suez Canal and the parallel SUMED pipeline: Egypt's only route (short of the Cape of Good Hope) between the Red Sea and the Mediterranean, carrying Persian Gulf crude and Qatari LNG to Europe and the US East Coast. About 4.85 million b/d of crude and petroleum products transited in 1H2025 (EIA STEO, Global Energy Security Data, Table 5 - the crude-only fraction of that figure is lower and is not separately published); Gulf crude bound for East or South Asia never enters the Red Sea.",
    descriptionByCommodity: {
      gas: "Suez Canal and the parallel SUMED pipeline: the route for Qatari LNG bound for Europe. EIA: 'nearly all (98%) of the northbound LNG transit is from Qatar and mainly destined for European markets.'",
    },
    routeName: "the Suez Canal and SUMED pipeline",
    location: { lon: 32.34, lat: 30.5 },
  },
  {
    id: "bab_el_mandeb",
    label: "Close Bab el-Mandeb Strait",
    kind: "chokepoint",
    commodities: ["oil", "gas"],
    description:
      "Strait between Yemen and the Horn of Africa, the southern gateway to the Red Sea for Gulf crude and Qatari LNG bound for Europe. About 3.9-4.5 million b/d of crude and products transited in 1H2025, down from a pre-Houthi-attack full-year-2023 peak of about 8.7 million b/d (EIA/Vortexa, via SAFETY4SEA). Saudi crude loaded at Yanbu, north of the strait via the East-West pipeline, does not transit it - it is exposed to Suez instead.",
    descriptionByCommodity: {
      gas: "Strait between Yemen and the Horn of Africa: Qatari LNG bound for Europe transits here; LNG bound for East or South Asia sails the other direction, through Hormuz and Malacca.",
    },
    routeName: "the Bab el-Mandeb Strait",
    location: { lon: 43.4, lat: 12.6 },
  },
  {
    id: "turkish_straits",
    label: "Close Turkish Straits",
    kind: "chokepoint",
    commodities: ["oil"],
    description:
      "Bosporus and Dardanelles, the only sea outlet from the Black Sea. Kazakhstan's CPC-blend crude, loaded onto tankers at Novorossiysk alongside Russian Black Sea crude, must pass through here to reach any buyer. This scenario models only the Kazakh share - the CPC pipeline scenario covers the same crude's overland leg - because BACI has no port-of-loading field and cannot separate Russia's Black Sea exports from its Baltic and Pacific ports.",
    routeName: "the Turkish Straits",
    location: { lon: 29.06, lat: 41.1 },
  },
  {
    id: "keystone",
    label: "Cut Keystone pipeline",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "TC Energy / South Bow's Keystone pipeline carries Western Canadian crude to US Midwest and Gulf Coast refineries - about 14% of Canada's crude oil exports to the US (Canada Energy Regulator).",
    routeName: "the Keystone pipeline",
    // Final review #13: P0024 (Hardisty, AB -> Patoka, IL) is only the base
    // pipeline. P5136 (Steele City, NE -> Cushing, OK) and P5156 (Cushing,
    // OK -> Nederland/Port Arthur, TX) are operating TC Energy legs of the
    // same Keystone system that actually reach the Gulf Coast refineries the
    // description names - confirmed by geometry (P5136's endpoints sit at
    // Steele City and Cushing; P5156's at Cushing and the Texas Gulf Coast)
    // and by `status: operating` / `operator: TC Energy` in pipelines.geojson.
    pipelineIds: ["P0024", "P5136", "P5156"],
  },
  {
    id: "enbridge_mainline",
    label: "Cut Enbridge Mainline",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Enbridge's Mainline system (Lines 1-4, 6, 65 and others) is the dominant route for Canadian crude into the US, carrying about 58% of all Canadian crude oil exports (Canada Energy Regulator).",
    routeName: "the Enbridge Mainline",
    // Verifier: P3871 ("Line 93") and P1991 ("Line 3") are two fragments of
    // the same physical corridor, not two separate pipelines - by geometry,
    // P3871 runs entirely inside Canada (lon -111..-98, lat 49.0-52.6,
    // Alberta/Saskatchewan/Manitoba down to the border) while P1991 runs
    // entirely inside the US (lon -97..-92, lat 46.6-48.8, Minnesota to
    // Superior, WI), even though P1991's own start/end_country_iso3
    // (CAN -> USA) name the whole route, not just this fragment. Highlighting
    // both would draw and attribute the same crude twice; P1991 is kept
    // because its geometry is the segment that actually crosses into the US.
    pipelineIds: ["P0008", "P0010", "P0011", "P0013", "P0016", "P1991"],
  },
  {
    id: "espo_spur",
    label: "Cut ESPO Skovorodino-Mohe spur",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "The Skovorodino-Mohe spur of the ESPO pipeline delivers Russian crude directly across the border into Daqing, China, bypassing any port. This models the direct-pipeline share only: seaborne ESPO Blend loaded at the Kozmino terminal is sold FOB to Asian buyers generally and cannot be separated in BACI from other Russian crude reaching China by tanker.",
    routeName: "the ESPO pipeline's Skovorodino-Mohe spur",
    pipelineIds: ["P5174"],
    sourceGap: {
      fromYear: 2022,
      text: "BACI's RUS→CHN total mixes true Skovorodino-Mohe/Kozmino-Pacific volumes with Western-Russia (Urals, Baltic/Black Sea) crude that has increasingly reached China by long-haul tanker since 2022 sanctions; the two cannot be separated in BACI, so this design-capacity share likely overstates the spur's true fraction of RUS→CHN trade in 2022–2024.",
    },
  },
];

/** First and last year LNG-T3 voyages cover (per-terminal attribution). */
export { LNG_T3_FIRST_YEAR, LNG_T3_LAST_YEAR };

/** Mean crude conversion used for volume display (EI Statistical Review: 1 t ≈ 7.33 bbl). */
export const BARRELS_PER_TONNE_CRUDE = 7.33;

/** S5 settings the disclosure must own up to; all inert by default. */
export interface HowComputedOptions {
  /** Fraction of the route cut, as the engine clamped it. 1 = full closure. */
  readonly severity?: number;
  /** Every scenario combined, primary first. One (or none) = not combined. */
  readonly combinedWith?: readonly ScenarioDef[];
  /** Which side of the flow the panel is showing. */
  readonly view?: "importer" | "exporter";
  /**
   * True when the active rows include importer-wide (inbound) shares. Without
   * them a chokepoint only cuts what the Gulf sends out, which is what the
   * default text says; with them that sentence would be false.
   */
  readonly hasInboundRoutes?: boolean;
  /**
   * How the active route shares are dated (`routeYears`): the years of the
   * flows the documents describe, and separately the publication years of
   * the rows that state none. The step that describes the shares says which
   * year's routing it applied: the headline figure is trade x share, so the
   * share's vintage is half of it.
   */
  readonly shareYears?: RouteYears;
}

/**
 * A severity as a percentage for prose: "50%", but "0.4%" rather than "0%"
 * (review finding 6 — a rounded-to-zero severity described a closure that the
 * numbers on screen plainly were not).
 */
export function severityPct(severity: number): string {
  const p = severity * 100;
  return `${p < 1 && p > 0 ? p.toFixed(1) : p.toFixed(0)}%`;
}

/**
 * Plain-language steps behind the scenario numbers, for the panel's
 * "How this is computed" disclosure. Mirrors engine.ts / shares.ts /
 * refinery.ts / lng.ts / lng-t3.ts — change those and this text must follow.
 *
 * Every S5 option adds a step only when it is actually in force, so a default
 * run reads exactly as it did before severity, the exporter view and combined
 * scenarios existed.
 */
export function howComputed(
  def: ScenarioDef,
  commodity: Commodity,
  year: number,
  options: HowComputedOptions = {},
): readonly string[] {
  const noun = commodity === "gas" ? "LNG (HS 271111)" : "crude (HS 2709)";
  const shareRule =
    def.kind === "chokepoint"
      ? `Shares are set per exporter, or per exporter → importer pair when the route only matters for some destinations (e.g. Persian Gulf crude to Europe crosses Bab el-Mandeb; to East Asia it does not). A pair row overrides the exporter's default, including a share of 0 to carve out buyers whose cargo never crosses ${def.routeName} at all (e.g. intra-Gulf trade for Hormuz).${
          options.hasInboundRoutes
            ? " Cargo arriving from outside carries its own share, set per importing country."
            : def.id === "hormuz"
              ? " Imports into the Gulf from outside are not counted."
              : ""
        }`
      : `Shares are set per exporter → importer pair (or per exporter where the pipeline serves all its buyers).`;
  // Which routing was applied, and from when. A document's publication year
  // is not the year of the flows it describes, so the two are said apart:
  // "describe 2025 routing" where the documents say so, "published 2019"
  // where that is all they say.
  const span = (ys: readonly number[]): string => {
    const first = ys[0];
    const last = ys[ys.length - 1];
    if (first === undefined || last === undefined) return "";
    return first === last ? first.toString() : `${first.toString()}\u2013${last.toString()}`;
  };
  const years = options.shareYears;
  const describes = span(years?.data ?? []);
  const publishedOnly = span(years?.published ?? []);
  const staticNote = ` they are static across years, so a ${year.toString()} result applies that routing to ${year.toString()} trade.`;
  const shareVintage =
    describes !== ""
      ? ` The shares in this run describe ${describes} routing${
          publishedOnly === ""
            ? ""
            : `, apart from some dated only by their document's publication year (${publishedOnly})`
        };${staticNote}`
      : publishedOnly !== ""
        ? ` The shares in this run come from documents published ${publishedOnly}, which do not say which year's flows they describe;${staticNote}`
        : "";
  const steps = [
    `Take ${year.toString()} bilateral ${noun} imports by volume (tonnes) from BACI (CEPII).`,
    `${shareRule}${shareVintage}`,
    `An importer's volume at risk = Σ over its suppliers of (imports from that supplier × route share). % at risk = volume at risk ÷ its total ${noun} imports.`,
  ];

  if (options.view === "exporter") {
    steps.push(
      `An exporter's volume at risk = Σ over its buyers of (exports to that buyer × route share). % at risk = volume at risk ÷ its total ${noun} exports — the revenue side of the same cut, from the same rows.`,
    );
  }

  const severity = options.severity;
  if (severity !== undefined && severity < 1) {
    const pct = severityPct(severity);
    steps.push(
      `Severity ${pct}: only ${pct} of what each route carries is cut, so every route share is multiplied by ${pct}. Total imports — the denominator of "% at risk" — are untouched.`,
    );
  }

  // Deduped (finding 6): the same scenario listed twice is one closure, and
  // "2 routes are closed at once (the Strait of Hormuz and the Strait of
  // Hormuz)" would be nonsense.
  const combined = [...new Map((options.combinedWith ?? []).map((d) => [d.id, d])).values()];
  if (combined.length > 1) {
    const names = combined.map((s) => s.routeName);
    const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
    steps.push(
      `${combined.length.toString()} routes are closed at once (${list}). Each route's shares are resolved on their own first, then combined. Because we know what fraction of a flow each route carries but not which cargoes, the result is a range: the low end is the largest single share (the routes may be in series, carrying the same barrels — cut once, not twice), the high end is the shares added and capped at 100% (they may be in parallel, carrying different barrels). Figures quote the low end; the range is shown alongside.`,
    );
  }
  if (commodity === "oil") {
    steps.push(
      "Refineries: a country's imports are split across its refineries by capacity (evenly where no refinery has capacity data), then the same shares apply. Refineries without capacity in the source are not ranked.",
      `Volumes shown in kb/d use ${BARRELS_PER_TONNE_CRUDE.toString()} barrels per tonne.`,
    );
  } else {
    const inT3 = year >= LNG_T3_FIRST_YEAR && year <= LNG_T3_LAST_YEAR;
    steps.push(
      inT3
        ? `Terminals (${LNG_T3_FIRST_YEAR.toString()}–${LNG_T3_LAST_YEAR.toString()}): LNG-T3 voyage data (a partial AIS sample) gives each terminal's share of its country's arrivals and its supplier mix; the BACI country total is split by those shares. Terminals in countries with no voyage coverage fall back to a split by capacity ("capacity proxy").`
        : `Terminals: the BACI country total is split across the country's import terminals by capacity ("capacity proxy"); per-terminal voyage data only covers ${LNG_T3_FIRST_YEAR.toString()}–${LNG_T3_LAST_YEAR.toString()}.`,
      `Terminals not yet in service in ${year.toString()} get no share: those still under construction, or commissioned later, unless they took cargoes that year.`,
      "Volumes shown in Mt (million tonnes per year).",
    );
  }
  return steps;
}

/**
 * Which `disruption_route` rows a scenario reads. Every chokepoint that ships
 * both an oil and a gas axis (Hormuz, Malacca, Suez, Bab el-Mandeb) stores its
 * LNG shares under `${scenarioId}_lng`: the crude bypasses these routes have
 * (Fujairah for Hormuz, Yanbu for Suez/Bab el-Mandeb) carry no LNG, so the two
 * axes need independent rows, not a shared one.
 *
 * A scenario that does not model `commodity` at all (Druzhba, BTC, CPC,
 * Turkish Straits, Keystone, Enbridge, ESPO on the gas axis) has **no** route
 * key: `null`. It used to return `${id}_lng` for those too, which named a
 * `disruption_id` that does not exist in the parquet — the loader then
 * returned no rows and the engine reported a confident 0 % (A1). Callers must
 * treat null as "this scenario says nothing about this commodity".
 */
export function routeKeyFor(scenarioId: ScenarioId, commodity: Commodity): string | null {
  const def = SCENARIOS.find((s) => s.id === scenarioId);
  if (def !== undefined && !def.commodities.includes(commodity)) return null;
  return commodity === "gas" ? `${scenarioId}_lng` : scenarioId;
}

/**
 * The scenario to keep when the commodity axis is `commodity`: `id` itself
 * when the scenario models that commodity, else null.
 *
 * A scenario the commodity does not model has no route rows at all, so the
 * pairing can only render a confident 0 % — an empty result that reads like an
 * answer (A1). Both the commodity toggle and `decodeAppState` clear it rather
 * than showing that, so a hand-typed `?scenario=druzhba&commodity=gas` and a
 * click on "Gas" behave the same way.
 */
export function scenarioForCommodity(
  id: ScenarioId | null,
  commodity: Commodity,
): ScenarioId | null {
  if (id === null) return null;
  const def = SCENARIOS.find((s) => s.id === id);
  if (def === undefined) return null;
  return def.commodities.includes(commodity) ? id : null;
}

export function getScenario(id: ScenarioId): ScenarioDef {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario: ${id}`);
  return found;
}
