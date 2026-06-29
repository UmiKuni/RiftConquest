function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toMillis(value) {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date ? d.getTime() : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

module.exports = {
  asNonEmptyString,
  asNumber,
  toMillis,
};
