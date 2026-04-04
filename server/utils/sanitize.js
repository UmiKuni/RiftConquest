const DISPLAY_NAME_MAX_LEN = 16;

/**
 * Sanitizes a raw display name string:
 *   - Trims and collapses whitespace
 *   - Strips characters outside [a-zA-Z0-9 _-]
 *   - Truncates to DISPLAY_NAME_MAX_LEN
 *
 * Returns null if the result is empty (invalid input).
 * Used by both the socket handlers and the Firestore persistence layer.
 */
function sanitizeDisplayName(raw) {
  if (typeof raw !== "string") return null;
  let name = raw.trim().replace(/\s+/g, " ");
  name = name.replace(/[^a-zA-Z0-9 _-]/g, "");
  if (!name) return null;
  if (name.length > DISPLAY_NAME_MAX_LEN) name = name.slice(0, DISPLAY_NAME_MAX_LEN);
  return name;
}

module.exports = { sanitizeDisplayName, DISPLAY_NAME_MAX_LEN };
