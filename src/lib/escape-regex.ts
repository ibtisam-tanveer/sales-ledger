/** Escape string for safe use inside `RegExp` (user-supplied search text). */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
