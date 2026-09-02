/**
 * Telling the reader *when* something changed, at the right resolution.
 *
 * The requirement, in the owner's words: *"the difference in the diffs can be a
 * few minutes only — minutes should be shown; versus days apart; versus what
 * happened on a particular date… I want to know all the way from 8–10pm, 20th
 * March 2026, Sunday."*
 *
 * So resolution is not fixed. It follows the **spread** of what is being
 * described:
 *
 *  - edits seconds or minutes apart are one working session, and inside it the
 *    interesting number is the offset from the previous edit (`+2 min`);
 *  - a session gets a heading naming the day and the span of hours it covered;
 *  - how that day is named depends on how far away it is — "Today", then
 *    "Yesterday", then the weekday, then the date, then the date with a year.
 *
 * Everything here is pure and dependency-free so it can be exercised directly.
 * Formatting is hand-rolled rather than `Intl`-driven: the app's interface is
 * English, and the exact shape of these strings is the feature.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Edits closer together than this belong to the same working session.
 *
 * 45 minutes is chosen against the grain of the data rather than for tidiness:
 * an agent's burst is seconds apart, a person's editing session has gaps of a
 * few minutes, and the thing worth separating is "that evening" from "the next
 * morning". Anything under about half an hour merges sessions that a reader
 * would describe as one sitting.
 */
export const SESSION_GAP_MS = 45 * MIN;

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Days between two instants, by calendar date in local time — *not* by
 *  elapsed milliseconds. 11pm and 1am are two days apart to a reader and 2
 *  hours apart to arithmetic, and the reader is right. */
export function calendarDaysApart(a: number, b: number): number {
  const da = new Date(a);
  const db = new Date(b);
  const ma = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const mb = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((mb - ma) / DAY);
}

/** `8:04 pm`, or `8 pm` on the hour — the `:00` is noise in a heading. */
export function clockTime(at: number): string {
  const d = new Date(at);
  const h24 = d.getHours();
  const m = d.getMinutes();
  const mer = h24 < 12 ? "am" : "pm";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h} ${mer}` : `${h}:${String(m).padStart(2, "0")} ${mer}`;
}

/**
 * `8:04–10:12 pm` for a span, `8:04 pm` for an instant.
 *
 * The meridiem is printed once when both ends share it, which is what makes
 * "8–10 pm" read like something a person would say. It has to be repeated
 * across noon or midnight, where dropping it would be ambiguous.
 */
export function clockSpan(from: number, to: number): string {
  // Under a minute apart is one moment, not a span. Without this, a burst of
  // agent writes renders as the faintly absurd "8:04–8:04 pm".
  if (Math.abs(to - from) < MIN) return clockTime(from);
  const a = new Date(from);
  const b = new Date(to);
  const sameMeridiem = a.getHours() < 12 === b.getHours() < 12;
  if (!sameMeridiem) return `${clockTime(from)} – ${clockTime(to)}`;
  // Strip the meridiem off the first half: "8:04–10:12 pm".
  const first = clockTime(from).replace(/ (am|pm)$/, "");
  return `${first}–${clockTime(to)}`;
}

/**
 * How to name the day something happened on, given how long ago that is.
 *
 * The ladder is the point. A weekday name is the most useful label for the last
 * week — "Sunday" locates it instantly — and completely useless beyond that,
 * where a date is the only thing that identifies which Sunday.
 */
export function dayLabel(at: number, now: number = Date.now()): string {
  const d = new Date(at);
  const delta = calendarDaysApart(at, now);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  if (delta > 1 && delta < 7) return WEEKDAY[d.getDay()];
  // Future stamps happen: a synced file can carry a clock ahead of this one.
  if (delta < 0 && delta > -7) return `${WEEKDAY[d.getDay()]} (ahead)`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const base = `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  return sameYear ? base : `${base} ${d.getFullYear()}`;
}

/**
 * A session's full heading: `Sunday, 8:04–10:12 pm`.
 *
 * This is the string the owner asked for by example, and it is deliberately one
 * line rather than a date column plus a time column — the two halves are only
 * meaningful together.
 */
export function sessionLabel(from: number, to: number, now: number = Date.now()): string {
  // A session that runs over midnight needs both days named, or it claims to
  // have happened entirely on whichever day it started.
  if (calendarDaysApart(from, to) !== 0) {
    return `${dayLabel(from, now)} ${clockTime(from)} – ${dayLabel(to, now)} ${clockTime(to)}`;
  }
  return `${dayLabel(from, now)}, ${clockSpan(from, to)}`;
}

/**
 * Compact "how long ago", for a badge or a list row where there is no space
 * for a sentence.
 *
 * Resolution drops off the way memory does: seconds matter for the last minute,
 * minutes for the last hour, and after a week only the date is worth the space.
 */
export function relativeTime(at: number, now: number = Date.now()): string {
  if (!at) return "never";
  const delta = now - at;
  if (delta < 0) return clockTime(at);
  if (delta < 45_000) return "just now";
  if (delta < HOUR) return `${Math.max(1, Math.round(delta / MIN))} min ago`;
  const days = calendarDaysApart(at, now);
  if (days === 0) {
    const h = Math.round(delta / HOUR);
    return h <= 1 ? "1 hour ago" : `${h} hours ago`;
  }
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return dayLabel(at, now);
}

/**
 * The offset from the previous edit in the same session: `+2 min`.
 *
 * This is the half of the requirement that a date heading cannot carry. Within
 * a burst the absolute time is the same to the minute for every entry, and the
 * only informative number is how far apart they were.
 */
export function offsetLabel(prevAt: number, at: number): string {
  const d = Math.max(0, at - prevAt);
  if (d < 1000) return "same moment";
  if (d < MIN) return `+${Math.round(d / 1000)} s`;
  if (d < HOUR) return `+${Math.round(d / MIN)} min`;
  return `+${Math.round(d / HOUR)} h`;
}

export interface Session<T> {
  from: number;
  to: number;
  items: T[];
}

/**
 * Cluster timestamped items into working sessions, newest first.
 *
 * Input may be in any order; it is sorted here rather than trusted, because the
 * callers assemble these lists by merging several files' revisions and the
 * merge order is whatever the file index happened to iterate in.
 */
export function groupIntoSessions<T>(
  items: T[],
  timeOf: (t: T) => number,
  gapMs: number = SESSION_GAP_MS,
): Array<Session<T>> {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => timeOf(b) - timeOf(a));
  const out: Array<Session<T>> = [];
  let current: Session<T> | null = null;

  for (const item of sorted) {
    const t = timeOf(item);
    // Walking newest-first, `current.from` is the oldest stamp seen so far in
    // this session, so that is the one the gap is measured against.
    if (current && current.from - t <= gapMs) {
      current.items.push(item);
      current.from = Math.min(current.from, t);
      continue;
    }
    if (current) out.push(current);
    current = { from: t, to: t, items: [item] };
  }
  if (current) out.push(current);
  return out;
}
