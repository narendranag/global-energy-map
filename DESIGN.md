# DESIGN.md — Global Energy Map

The look of https://energymap.marain.space as built: the map (`/`), the reading pages (`/methodology`, `/data`, `/terms`, `/privacy`) and the query console (`/query`). It replaces the fleet's house design (`~/claude-computer/claude-global/DESIGN.md`) for everything in this repo; anything it leaves out falls back to the house file. Written from the code on 2026-11-28: `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/symbology/index.ts`, `src/components/**`.

## The idea

A light, editorial, restrained instrument for analysts. The map is the page; everything else is a white card floating over it, translucent enough to keep the geography in view. Neutrals are cool (white and slate), not the house's warm paper. Colour on the map carries **data**, a hue family per commodity, and red means one thing only: scenario exposure. Text is small and dense, figures are tabular, and every number says where it comes from and how old it is.

House match in one line: light-only, tabular figures, a 2px focus ring offset 2px, uppercase tracked section labels, amber for "look at this", sentence case. It differs in its cool neutrals, the Geist webfont, smaller radii and translucent panels.

## Tokens

Defined on `:root` in `src/app/globals.css` and exposed to Tailwind v4 through `@theme inline` (`bg-panel`, `border-panel-border`, `text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-2xs`). **Light only, by decision** (2026-09-10): `color-scheme: light`, no `prefers-color-scheme` block, because the basemap is a light style and a dark body made a void behind it.

| Token | Value | For |
| --- | --- | --- |
| `--background` | `#ffffff` | the page |
| `--foreground` / `--ink` | `#1c1f23` (16.1:1 on white) | text, primary fills |
| `--ink-muted` | `#4b5058` (8.0:1) | body text in prose, secondary text |
| `--ink-subtle` | `#686d75` (5.3:1) | the lightest text allowed |
| `--panel` | `rgb(255 255 255 / 0.94)` | floating panels over the map |
| `--panel-solid` | `#ffffff` | panels that must be opaque |
| `--panel-border` | `#e3e4e0` | panel borders, rules, table lines |
| `--panel-divider` | `#ecedea` | rules inside a panel (defined, unused) |
| `--accent` | `#1c1f23` | (defined, unused) |
| `--focus` | `#2f4fa6` | the focus ring |

In practice the components also use Tailwind v4's default scales directly (see Drift): slate for chrome (`text-slate-600/700/800/900`, `border-slate-200/300`, `bg-slate-50/100`, `bg-slate-800` for a selected or primary control), sky for links (`text-sky-800`, hover `text-sky-950`; `bg-sky-100` for an active search row or chip), amber for attention (`bg-amber-50`, `border-amber-600`, `text-amber-900`), emerald for a confirmation (`text-emerald-800`, the "copied" status; `bg-emerald-100 text-emerald-900` for a downloadable badge), red for an error box (`border-red-300 bg-red-50`).

Text contrast: at least 4.5:1 composited over black (the worst case for a translucent panel); `slate-500` fails, so `slate-600` is the lightest slate used for text. Tested by `tests/e2e/a11y.spec.ts` (axe, zero serious/critical).

### Map palette

The map's colours are not CSS: they live in `PALETTE` in `src/lib/symbology/index.ts`, and the Legend renders from the same constants. `tests/unit/symbology-contrast.test.ts` checks them against the basemap and each other (normal vision plus protan/deutan). Never inline an RGBA in a layer file.

| Family | Roles and hexes |
| --- | --- |
| Oil, warm | pipeline `#6f360b`, refinery `#df9a1a`, extraction `#b85a14`, storage `#8f7a58`, trade arc `#e3b46a` → `#823f0e` |
| Gas, cool | pipeline `#08727c`, LNG terminal `#0987ad`, voyage `#2aa5c4` → `#2f4fa6`, trade arc `#8ed3e2` → `#163f6e`, storage fullness `#e8f0f2` → `#1d5f78` |
| Reserves, olive | `#efeee4` → `#6e9a46` (log ramp); greyed `#d0d0cb` while a scenario runs, so red is the only hue on the choropleth |
| Shale and recent imports | oil `#f6e8d8`/`#f4e6d6` → `#c98446`; gas `#e4ebf6` → `#7f98cf`, `#e3ebf4` → `#8ea4d4` (tops kept light for the marks drawn over them) |
| Neutral | port `#5f6670`, basin `#6e5c48`, country outline `#9a9a94`, no data `#c8c8c4` |
| Scenario, red only | exposure `#fcbba1` → `#99000d`, asset at risk `#a3141c` → `#650810`, disruption mark `#d21024` (muted out of its years: `#9c7a7e`) |
| Selection | focus outline `#101a24` on a white halo; search highlight violet `#7c3aed` on a white halo (the one hue no data layer owns) |

Basemap: OpenFreeMap Positron (land `#f2f3f0`, water `#c2c8ca`), not ours, labels drawn above our fills.

## Type

- **Families:** Geist and Geist Mono, loaded with `next/font/google` (self-hosted under `/_next/static/media/`, `display: swap`; no request to Google at runtime). `--font-sans: Geist, ui-sans-serif, system-ui, sans-serif`; `--font-mono: Geist Mono, ui-monospace, "SFMono-Regular", monospace`. `antialiased` and `text-rendering: optimizeLegibility` on the body.
- **Mono carries figures and data:** values in ranked rows, years, percentages, SQL, file names and code. Figures that line up take the `.tabular` class (`font-variant-numeric: tabular-nums`).
- **Scale (never below 11px):**

| Step | Size | For |
| --- | --- | --- |
| `text-2xs` | 11px / 16px | captions, legend notes, the footer, figures in rows |
| `text-xs` | 12px | legend rows, secondary panel text, section labels, header nav |
| `text-sm` | 14px | panel body, controls, tables in prose |
| `text-base` | 16px | reading pages' body (`leading-relaxed`) |
| `text-lg` | 18px | prose h3 |
| `text-2xl` | 24px | prose h2, ruled underneath |
| `text-3xl` | 30px | page title on reading pages |
| 15px | | the app's name in the header |

- **Weights:** 400 body, 500 (`font-medium`) for controls and labels, 600 (`font-semibold`) for titles, headings and emphasised figures. Titles take `tracking-tight`.
- **Section labels:** 12px, 500, uppercase, `tracking-wide`, `slate-600` (scenario, country and layer panels); 11px, 600, `tracking-wider` for group heads inside a panel.

## Shape and space

- **Radius:** 4px (`rounded`) for buttons, inputs, code, small chips; 6px (`rounded-md`) for floating panels, the mode tabs' track and dialogs; 8px (`rounded-lg`) for the share menu and the as-of chip; full for the loading pill.
- **Shadow:** floating panels `shadow-lg` (dialogs, the intro card and the share menu `shadow-xl`); the header, buttons and the selected tab `shadow-sm`. Panels over the map add `backdrop-blur` on a 90–95% white.
- **Borders:** 1px `--panel-border` or `slate-200/300`.
- **Spacing:** Tailwind's 4px grid. Panels sit 16px (`left-4`/`right-4`/`top-4`) from the map's edges, padding 12px (`p-3`) or 16px for the intro card and dialogs. Reading pages: `max-w-7xl` (1280px) frame with 24px gutters and 40px top and bottom, prose held to `max-w-3xl` (768px); legal pages are `max-w-3xl` throughout.
- **Panel widths:** layers 288px (`w-72`), scenario 320px (`w-80`), country `min(21rem, 100% − 2rem)`, intro card up to 24rem between them, share menu 28rem.

## Layout

- **The map page** is full-bleed: a 1-line header on top, the map filling the rest, one canvas (MapLibre with deck.gl interleaved). Floating over it: the layer panel top left, the scenario panel or country panel top right, the intro card between them, the as-of chip bottom centre, the map footer bottom left. Panels never overlap what the camera fits to: `panelPadding()` makes each panel's width a camera inset.
- **Header:** white, a bottom border and `shadow-sm`; the app name (15px, 600) with a one-line tagline from `xl` up; the mode tabs; a loading pill while layers fetch; the search box; site links (Methodology, Data, Query) right-aligned in `sky-800`.
- **Reading pages** (`/methodology`, `/data`, `/terms`, `/privacy`, `/query`): a white page, left-aligned, 30px title, then prose styled by `PROSE` (`src/components/ui/prose.ts`); `SiteFooter` underneath.
- **Phone:** a one-line amber "best viewed on a desktop" banner, panels collapsed, the map still pannable. Not a designed phone layout.
- **Embed** (`?embed=1`): header, intro card, banner and full footer give way to an attribution bar; the as-of chip always stays.

## Components

- **Floating panel:** `bg-white/95`, `rounded-md`, `shadow-lg`, `backdrop-blur`, `p-3`, `text-sm text-slate-800`; collapsible to a one-line uppercase label button. Sections inside separated by an uppercase label.
- **Mode tabs (segmented control):** `slate-100` track with a `slate-300` border, `rounded-md`, 2px padding, 12px 500 text; the active tab white with `shadow-sm` and a `slate-300` ring. Arrow keys, Home and End move between tabs.
- **Commodity toggle and citation format picker:** a joined pair of buttons; the active one `bg-slate-800 text-white`.
- **Button:** `rounded`, 1px `slate-300`, white, 12px 500, `px-2.5 py-1`, `shadow-sm`, hover `slate-50`. Primary: `bg-slate-800` (or `bg-ink`) with white text. Outline primary (consent banner): `border-ink`, inverting on hover.
- **Ranked row:** a real button; label truncated with an ellipsis, a mono 11px figure in a fixed `min-w-[4.5rem]` column, a bar or swatch. Pointer hover and keyboard focus both highlight the country on the map.
- **Layer row:** checkbox, label (truncated), a small vintage badge ("to 2024", "as of 9 Apr 2025", "live" in sky, "old" past 18 months).
- **Legend:** generated from `legendSections()`; swatches are gradients, fills, lines, dots, triangles (filled = export, hollow = import), the anchor glyph for ports, and arcs.
- **As-of chip:** amber, `rounded-lg`, `shadow-md`, "As of {year}" in mono 600 with a "View latest" button. Shown only on a pinned historical link.
- **Section vintage line:** one 11px line under each panel section stating source and vintage ("data to 2024 (released 2026-01-01)"), with "(old)" past 18 months.
- **Map glyphs:** the disruption mark (white halo disc, red ring, red centre dot); a cut route (red line on a 6px white casing); the focus outline (near-black on a white halo); a hover (white wash and a thin dark edge). Casing is the rule wherever a line must read on both the pale basemap and the darkest fill.
- **Error panel:** white, `rounded-md`, `shadow-xl`, `max-w-md`, reload and report-an-issue buttons. Errors always surface; never a blank or forever-loading map.
- **Focus:** `outline: 2px solid var(--focus); outline-offset: 2px` on every `:focus-visible`; on the map canvas, inset (`-3px`) and `!important` against deck.gl's inline `outline: none`.
- **Icons:** inline SVG only (chevron, legend swatches, the anchor and triangle glyphs), in `currentColor` or palette colours. No icon font, no emoji; the intro card's close is a plain `×`.

## Motion

Almost none. `transition-colors` on tabs and buttons; camera moves (`flyTo`, `fitBounds`) only when the reader changes the scenario or picks a result, never on load, and instant under `prefers-reduced-motion`. No animated layers.

## Imagery

None. No photographs, illustrations or hero art: the map is the only picture, and the only drawings are the legend swatches and map glyphs above. Credits for every source sit in the map footer and the embed's attribution bar ("Data: Global Energy Monitor, CC BY 4.0" and the rest), never hidden.

## Words

Plain, exact, written for researchers. The lead is the question the map answers ("Who loses supply when a chokepoint closes or a pipeline is cut?"). Sentence case; numbers with units; en dash in year ranges ("2018–2025"). Every figure states its vintage and source, derived from the catalog, never hand-typed. Honest about gaps: "No reserves data in source", "Not reported to GIE", "a data gap, not 'safe'", lower bounds called lower bounds. Labels describe what is shown, not what a control does ("to 2020", not "responds to the slider"). No marketing adjectives, no exclamation marks.

## Drift to decide

1. **Tokens versus raw slate.** `globals.css` asks for the tokens, but components use raw Tailwind slate far more (`text-slate-600` 43×, `text-slate-700` 33×, `border-slate-300` 30×, against `text-ink-muted` 39×, `border-panel-border` 36×). Recommend: map slate-600/700 → `ink-muted`, slate-800/900 → `ink`, slate-200/300 borders → `panel-border`, as files are touched, not in one sweep.
2. **Links have no token.** `sky-800` / `sky-950` is typed in 28 places each. Recommend a `--link` token (`#075985`-ish) and `text-link`.
3. **Focus colour overridden.** `--focus` is `#2f4fa6`, but about 20 controls set their own `focus-visible:outline-sky-700` (or slate). Recommend deleting the overrides so the global ring applies.
4. **Two primaries.** Primary buttons are `bg-slate-800` in the intro card, commodity toggle and share menu, `bg-ink` in the error panel and consent banner. Recommend `bg-ink` everywhere.
5. **Section labels in four styles.** 12px 500 `tracking-wide` slate-600 (panels), 11px 600 `tracking-wider` (layer groups, intro card), 11px 500 `tracking-wider` `ink-subtle` (legend), 12px 600 `ink-muted` (share menu). Recommend one: 11px 600 uppercase `tracking-wider` `ink-subtle`, as a shared class.
6. **Arbitrary sizes.** `text-[11px]` appears where `text-2xs` is the same size; the header title is `text-[15px]`. Recommend `text-2xs`, and either a named step for the title or `text-base`.
7. **Panels don't match.** The layer panel and intro card have a `slate-200` border, the scenario and country panels none; shadows vary between `lg` and `xl`. Recommend: border on all, `shadow-lg` for panels, `shadow-xl` for dialogs and menus only. `bg-panel` (the token for exactly this) is used twice; the rest type `bg-white/95`.
8. **Unused tokens.** `--accent` and `--panel-divider` are defined and never used. Recommend using `--panel-divider` for in-panel rules or deleting both.
9. **Violet search highlight** goes against the house's "no purple", but here it is deliberate (the one hue no data layer owns). Recommend keeping it; recorded so nobody "fixes" it.
