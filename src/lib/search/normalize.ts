/**
 * Case- and diacritic-insensitive folding, shared by index build (once per
 * item) and the matcher (once per keystroke, on the query only).
 */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
