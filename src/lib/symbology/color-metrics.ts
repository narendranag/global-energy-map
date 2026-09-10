/**
 * Colour-distance maths used to validate the palette (unit-tested, not used
 * at runtime): WCAG contrast, OKLab ΔE (×100), and colour-vision-deficiency
 * simulation (Machado, Oliveira & Fernandes 2009, severity 1.0).
 */
import type { Rgb, Rgba } from "./index";

export type Cvd = "protan" | "deutan" | "tritan";

const MACHADO: Readonly<Record<Cvd, readonly (readonly [number, number, number])[]>> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** "#rrggbb" → [r, g, b] in 0–255. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.replace(/^#/, "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
}

/** Composite a translucent colour over an opaque background (what the eye sees). */
export function over(c: Rgba | Rgb, bg: Rgb): Rgb {
  const a = (c.length === 4 ? c[3] : 255) / 255;
  return [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a)];
}

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function linear(c: Rgb): [number, number, number] {
  return [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];
}

function relLuminance(c: Rgb): number {
  const [r, g, b] = linear(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio (1–21). */
export function contrast(a: Rgb, b: Rgb): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function oklab([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function simulate(c: Rgb, kind: Cvd): [number, number, number] {
  const lin = linear(c);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const row = (i: number) => {
    const m = MACHADO[kind][i] ?? [0, 0, 0];
    return clamp(m[0] * lin[0] + m[1] * lin[1] + m[2] * lin[2]);
  };
  return [row(0), row(1), row(2)];
}

/** OKLab Euclidean distance ×100; `kind` simulates a colour-vision deficiency first. */
export function deltaE(a: Rgb, b: Rgb, kind?: Cvd): number {
  const pa = oklab(kind ? simulate(a, kind) : linear(a));
  const pb = oklab(kind ? simulate(b, kind) : linear(b));
  return 100 * Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/** OKLCH [lightness 0–1, chroma, hue in degrees 0–360]. */
export function oklch(c: Rgb): [number, number, number] {
  const [l, a, b] = oklab(linear(c));
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [l, Math.hypot(a, b), h];
}
