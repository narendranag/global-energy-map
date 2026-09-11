import Link from "next/link";
import { AUTHOR_NAME, AUTHOR_URL, PRACTICE_NAME, PRACTICE_URL, SOURCE_URL } from "./provenance";

const LINK = "text-sky-800 underline underline-offset-2 hover:text-sky-950";

/**
 * Provenance + legal footer for the content pages (/methodology, /data,
 * /terms, /privacy). The map has its own compact line in MapFooter.
 */
export function SiteFooter() {
  return (
    <footer
      className="mt-16 border-t border-panel-border pt-6 text-sm leading-relaxed text-ink-muted"
      data-testid="site-footer"
    >
      <p>
        The Global Energy Map is built and maintained by{" "}
        <a href={AUTHOR_URL} className={LINK} rel="author">
          {AUTHOR_NAME}
        </a>{" "}
        as a project of{" "}
        <a href={PRACTICE_URL} className={LINK}>
          {PRACTICE_NAME}
        </a>{" "}
        (marain.space). Source code on{" "}
        <a href={SOURCE_URL} className={LINK}>
          GitHub
        </a>
        .
      </p>
      <nav aria-label="Legal" className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/terms" className={LINK}>
          Terms of use
        </Link>
        <Link href="/privacy" className={LINK}>
          Privacy
        </Link>
        <Link href="/methodology#licences" className={LINK}>
          Data licences
        </Link>
      </nav>
    </footer>
  );
}
