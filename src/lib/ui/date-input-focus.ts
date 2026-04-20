import type { FocusEvent } from "react";

/**
 * Attach to `<input type="date">` so focusing the field selects its value for faster typing.
 * Uses rAF because some browsers ignore select() on the same tick as focus.
 */
export function selectDateInputOnFocus(e: FocusEvent<HTMLInputElement>): void {
  const el = e.currentTarget;
  requestAnimationFrame(() => {
    el.select();
  });
}
