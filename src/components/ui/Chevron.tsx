/** Disclosure chevron: points right when closed, down when open. */
export function Chevron({ open }: { readonly open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={"h-3 w-3 shrink-0 transition-transform " + (open ? "rotate-90" : "")}
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
