/**
 * How the *next* focus change was made, so the country panel knows whether it
 * may take keyboard focus.
 *
 * WCAG 3.2.1: moving focus into a panel the user opened with the keyboard is
 * helpful; doing it after a mouse click on the map is theft — the pointer
 * user is still working the map and would lose their place, and the next
 * arrow key would pan nothing.
 *
 * It is a module-level flag rather than a prop because the setter (a partner
 * row inside the panel, a search result later) and the reader (the panel) are
 * separated by `setState` in `page.tsx`, and threading an "intent" through
 * `AppState` would put a transient interaction detail into the shared URL
 * state. The flag is consumed once and resets to "pointer", so a stale
 * intent can never steal focus later.
 */

export type FocusIntent = "pointer" | "keyboard";

let pending: FocusIntent = "pointer";

/** Declare how the focus change about to be dispatched was made. */
export function setFocusIntent(intent: FocusIntent): void {
  pending = intent;
}

/** Read and clear the intent. Anything not explicitly keyboard is a pointer. */
export function takeFocusIntent(): FocusIntent {
  const intent = pending;
  pending = "pointer";
  return intent;
}

/**
 * Whether a click event came from the keyboard. Browsers dispatch a synthetic
 * `click` with `detail === 0` for Enter/Space on a button, and a real pointer
 * click always carries a positive click count.
 */
export function isKeyboardClick(e: { readonly detail: number }): boolean {
  return e.detail === 0;
}
