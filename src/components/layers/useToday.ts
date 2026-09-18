import { useSyncExternalStore } from "react";

const noop = () => () => undefined;
const today = () => new Date().toISOString().slice(0, 10);
const serverToday = () => null;

/**
 * Today's ISO date on the client, null during prerender and hydration.
 *
 * The "old" marker compares data dates against the visitor's today, not the
 * build's: a page built today and read in a year should say so. Returning null
 * on the server keeps prerendered HTML free of a date that would mismatch on
 * hydrate; the marker appears on the client's first commit.
 */
export function useToday(): string | null {
  return useSyncExternalStore(noop, today, serverToday);
}
