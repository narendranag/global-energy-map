/**
 * The visitor's analytics choice, kept in this browser (localStorage `consent`:
 * `granted` | `denied`). Consent Mode starts denied for everyone
 * (`GoogleTagManager` sets it before the container loads); an Allow here sends
 * `analytics_storage: granted`. Ads storage is never granted.
 */
import { gtag } from "./track";

export const CONSENT_KEY = "consent";
const EVENT = "consent-change";

export type Choice = "granted" | "denied" | null;

export function readChoice(): Choice {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return "denied"; // storage blocked: nothing can be remembered, so do not ask on every page
  }
}

export function subscribeChoice(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}

/** Store a choice (or `null` to forget it and ask again) and tell Google. */
export function setChoice(choice: Choice): void {
  try {
    if (choice) localStorage.setItem(CONSENT_KEY, choice);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Blocked storage: the update below still applies to this page.
  }
  if (choice) gtag("consent", "update", { analytics_storage: choice });
  // A "Decline" after an earlier "Allow" also removes the cookies that Allow set.
  if (choice === "denied") {
    for (const c of document.cookie.split(";")) {
      const name = (c.split("=")[0] ?? "").trim();
      if (!name.startsWith("_ga")) continue;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname}`;
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  }
  window.dispatchEvent(new Event(EVENT));
}
