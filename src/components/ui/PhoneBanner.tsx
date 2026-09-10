/**
 * Under 768 px (D11 / 9.7): phones are a read-only view. The map stays
 * pannable, panels collapse to their headers, and this slim note says so.
 */
export function PhoneBanner() {
  return (
    <p
      role="note"
      data-testid="phone-banner"
      className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1 text-center text-[11px] leading-snug text-amber-900 md:hidden"
    >
      Best viewed on a desktop — the map is pannable, panels are collapsed.
    </p>
  );
}
