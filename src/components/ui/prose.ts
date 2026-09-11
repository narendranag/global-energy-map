/** Shared styles for build-time rendered markdown pages (/methodology, /terms, /privacy). */
// Element-level styles for the rendered markdown (no @tailwindcss/typography).
export const PROSE = [
  "text-base leading-relaxed text-ink-muted",
  "[&_h2]:mt-12 [&_h2]:scroll-mt-6 [&_h2]:border-b [&_h2]:border-panel-border [&_h2]:pb-1.5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink",
  "[&_h3]:mt-8 [&_h3]:scroll-mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_h4]:mt-6 [&_h4]:font-semibold [&_h4]:text-ink",
  "[&_p]:mt-3",
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1.5 [&_li>ul]:mt-1.5",
  "[&_a]:text-sky-800 [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-sky-950",
  "[&_strong]:font-semibold [&_strong]:text-ink",
  "[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-ink",
  "[&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-50 [&_pre]:border [&_pre]:border-panel-border [&_pre]:p-3 [&_pre]:text-sm [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-panel-border [&_blockquote]:pl-4",
  "[&_table]:mt-4 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:text-sm",
  "[&_th]:border-b [&_th]:border-slate-300 [&_th]:py-1.5 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_th]:text-ink",
  "[&_td]:border-t [&_td]:border-panel-border [&_td]:py-1.5 [&_td]:pr-4 [&_td]:align-top",
  "[&_hr]:my-8 [&_hr]:border-panel-border",
].join(" ");
