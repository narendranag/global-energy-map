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
 * state.
 *
 * **It has to expire** (B6). The reader is the panel's `[iso3]` effect, and a
 * dispatch that does not change `iso3` — pressing Enter on the partner row
 * for the country already selected — never runs it. The flag then stayed
 * pending, and the *next* selection, made with the mouse on some other
 * country, moved focus into the panel: exactly the focus theft the flag
 * exists to prevent (WCAG 3.2.1). So a declaration is good for one read
 * within {@link FOCUS_INTENT_TTL_MS}; after that it reads as "pointer", and
 * any later declaration (including an explicit "pointer" one from the map
 * click path) overwrites it.
 */

export type FocusIntent = "pointer" | "keyboard";

/**
 * How long a declared intent stays good. It is dispatched and read inside one
 * React commit, so this only has to outlive a render — but it must be far
 * shorter than the gap to a user's next click.
 */
export const FOCUS_INTENT_TTL_MS = 500;

let pending: FocusIntent = "pointer";
let declaredAt = 0;

/** Declare how the focus change about to be dispatched was made. */
export function setFocusIntent(intent: FocusIntent): void {
  pending = intent;
  declaredAt = Date.now();
}

/** Read and clear the intent. Anything not explicitly keyboard is a pointer. */
export function takeFocusIntent(): FocusIntent {
  const fresh = Date.now() - declaredAt <= FOCUS_INTENT_TTL_MS;
  const intent = fresh ? pending : "pointer";
  pending = "pointer";
  declaredAt = 0;
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
