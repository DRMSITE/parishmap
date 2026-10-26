// How dates are shown to people (and how "today" is decided), in one place.

/**
 * A stored due date (year-month-day) as "1 Dec 2026". It is a calendar date, not a
 * moment, so it is read as UTC and shown as UTC to keep the day the same everywhere.
 * @param {string} date
 */
export function formatDueDate(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A timestamp as "25 Oct 2026, 10:04", in the viewer's time zone.
 * @param {string} iso
 */
export function formatWhen(iso) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Today's date in the viewer's own calendar, as year-month-day.
 * @param {Date} [now]
 */
export function today(now = new Date()) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Whether an action is late: it has a due date before today and is not done.
 * @param {{ dueDate?: string, lane: string }} action
 * @param {string} [onDate] Today, as year-month-day.
 */
export function isOverdue(action, onDate = today()) {
  return Boolean(
    action.dueDate && action.lane !== "done" && action.dueDate < onDate,
  );
}
