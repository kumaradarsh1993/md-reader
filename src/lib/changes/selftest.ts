/**
 * Assertions for the pure logic behind Changes.
 *
 * ## Why this exists as a module rather than a test file
 *
 * This repo has no JavaScript test runner, and `cargo test` cannot launch a
 * harness in the app crate (it links WebView2 — see `HANDOVER.md`). The house
 * answer for verifying frontend behaviour is `?devmock=1` in the Browser pane,
 * so the durable form for *logic* assertions is a module the dev route runs and
 * renders. Fox Mark reached the same arrangement independently.
 *
 * The point is that these survive the session that wrote them. Time formatting
 * has a branch per resolution and every one of them is invisible until it is
 * wrong in front of a reader — an hour out and a file closed a minute ago reads
 * as "1 hour ago"; a weekday name past seven days names a Sunday without saying
 * which Sunday.
 *
 * Run: `npm run dev`, then open `/selftest`.
 */

import {
  clockSpan,
  clockTime,
  dayLabel,
  groupIntoSessions,
  offsetLabel,
  relativeTime,
  sessionLabel,
} from "./time";
import { describeRegions, diffRegions, inlineOps, snapToBlocks } from "./regions";

export interface Check {
  group: string;
  label: string;
  got: unknown;
  want: unknown;
  ok: boolean;
}

function eq(out: Check[], group: string, label: string, got: unknown, want: unknown) {
  out.push({ group, label, got, want, ok: JSON.stringify(got) === JSON.stringify(want) });
}

/** A fixed instant, so every expectation below is deterministic. Wednesday
 *  25 March 2026, 11:00 local. */
const at = (y: number, mo: number, d: number, h: number, mi: number) =>
  new Date(y, mo - 1, d, h, mi, 0).getTime();
const NOW = at(2026, 3, 25, 11, 0);

export function runChecks(): Check[] {
  const out: Check[] = [];

  // ─── Time: resolution follows the spread ──────────────────────────────
  const g = "Time";
  eq(out, g, "a burst on one evening", sessionLabel(at(2026, 3, 25, 20, 4), at(2026, 3, 25, 22, 12), NOW), "Today, 8:04–10:12 pm");
  // The shape the owner asked for by example.
  eq(out, g, "exact hours read plainly", sessionLabel(at(2026, 3, 25, 20, 0), at(2026, 3, 25, 22, 0), NOW), "Today, 8–10 pm");
  // A single edit must not be dressed up as a span.
  eq(out, g, "one instant is not a span", sessionLabel(at(2026, 3, 25, 20, 4), at(2026, 3, 25, 20, 4), NOW), "Today, 8:04 pm");
  eq(out, g, "yesterday", sessionLabel(at(2026, 3, 24, 20, 0), at(2026, 3, 24, 21, 0), NOW), "Yesterday, 8–9 pm");
  // 22 Mar 2026 really is a Sunday; the weekday is derived, never assumed.
  eq(out, g, "a weekday inside the week", sessionLabel(at(2026, 3, 22, 20, 0), at(2026, 3, 22, 22, 0), NOW), "Sunday, 8–10 pm");
  // Past a week "Sunday" names a Sunday without saying which one.
  eq(out, g, "older than a week needs a date", sessionLabel(at(2026, 3, 8, 20, 0), at(2026, 3, 8, 22, 0), NOW), "Sun 8 Mar, 8–10 pm");
  eq(out, g, "another year carries the year", sessionLabel(at(2025, 3, 9, 20, 0), at(2025, 3, 9, 22, 0), NOW), "Sun 9 Mar 2025, 8–10 pm");
  // Dropping the meridiem across noon would be ambiguous.
  eq(out, g, "crossing noon repeats the meridiem", sessionLabel(at(2026, 3, 25, 11, 40), at(2026, 3, 25, 13, 5), NOW), "Today, 11:40 am – 1:05 pm");
  // A session that runs over midnight must name both days.
  eq(out, g, "over midnight names both days", sessionLabel(at(2026, 3, 24, 23, 40), at(2026, 3, 25, 0, 20), NOW), "Yesterday 11:40 pm – Today 12:20 am");
  eq(out, g, "midnight is 12 am", clockTime(at(2026, 3, 25, 0, 0)), "12 am");
  eq(out, g, "noon is 12 pm", clockTime(at(2026, 3, 25, 12, 0)), "12 pm");
  // Under a minute is one moment, or a burst renders as "8:04–8:04 pm".
  eq(out, g, "sub-minute span collapses", clockSpan(at(2026, 3, 25, 20, 4), at(2026, 3, 25, 20, 4) + 30_000), "8:04 pm");

  eq(out, g, "relative: minutes", relativeTime(NOW - 14 * 60_000, NOW), "14 min ago");
  eq(out, g, "relative: hours", relativeTime(NOW - 3 * 3_600_000, NOW), "3 hours ago");
  eq(out, g, "relative: yesterday", relativeTime(at(2026, 3, 24, 9, 0), NOW), "yesterday");
  eq(out, g, "relative: days", relativeTime(at(2026, 3, 22, 9, 0), NOW), "3 days ago");
  eq(out, g, "relative: never", relativeTime(0, NOW), "never");
  // Calendar days, not elapsed hours: 11pm and 1am are two days apart to a
  // reader and two hours apart to arithmetic, and the reader is right.
  eq(out, g, "day boundary beats elapsed time", relativeTime(at(2026, 3, 24, 23, 30), at(2026, 3, 25, 0, 30)), "yesterday");
  eq(out, g, "day label: today", dayLabel(NOW, NOW), "Today");

  eq(out, g, "offset in minutes", offsetLabel(at(2026, 3, 25, 20, 4), at(2026, 3, 25, 20, 6)), "+2 min");
  eq(out, g, "offset in seconds", offsetLabel(NOW, NOW + 8_000), "+8 s");

  // ─── Sessions ─────────────────────────────────────────────────────────
  const s = "Sessions";
  const stamps = [
    at(2026, 3, 25, 20, 0),
    at(2026, 3, 25, 20, 2),
    at(2026, 3, 25, 20, 4),
    at(2026, 3, 25, 23, 30),
  ].map((t) => ({ t }));
  const grouped = groupIntoSessions(stamps, (x) => x.t);
  eq(out, s, "a three-hour gap splits", grouped.length, 2);
  eq(out, s, "newest session first", grouped[0].items.length, 1);
  eq(out, s, "the burst stays together", grouped[1].items.length, 3);
  eq(out, s, "empty input", groupIntoSessions([], (x: { t: number }) => x.t).length, 0);
  // Input order must not matter: the inbox merges several files' revisions and
  // the merge order is whatever the index iterated in.
  const shuffled = groupIntoSessions([stamps[3], stamps[1], stamps[0], stamps[2]], (x) => x.t);
  eq(out, s, "unsorted input groups the same", shuffled.map((x) => x.items.length), [1, 3]);

  // ─── Regions ──────────────────────────────────────────────────────────
  const r = "Regions";
  const before = "# Title\n\nAlpha one two.\n\nBeta three four.\n\nGamma five six.\n";
  const oneWord = "# Title\n\nAlpha one two.\n\nBeta three FOUR.\n\nGamma five six.\n";
  const regions = diffRegions(before, oneWord);
  eq(out, r, "one edit is one region", regions.length, 1);
  eq(out, r, "region is marked changed", regions[0]?.kind, "changed");
  // The whole paragraph, not the single line: a bar has to span something a
  // reader recognises, and a diff starting mid-sentence reads as damage.
  eq(out, r, "region covers the whole paragraph", [regions[0]?.from, regions[0]?.to], [5, 5]);
  eq(out, r, "before text captured", regions[0]?.before, "Beta three four.");
  eq(out, r, "after text captured", regions[0]?.after, "Beta three FOUR.");
  eq(out, r, "identical input yields nothing", diffRegions(before, before).length, 0);

  // Two edits inside one paragraph must not produce two bars.
  const twoInOne = "# Title\n\nAlpha ONE two.\n\nBeta three four.\n\nGamma five SIX.\n";
  eq(out, r, "distant edits stay separate", diffRegions(before, twoInOne).length, 2);

  const added = before + "\nDelta seven.\n";
  const addedRegions = diffRegions(before, added);
  eq(out, r, "an addition is 'added'", addedRegions[0]?.kind, "added");
  eq(out, r, "an addition has no before", addedRegions[0]?.before, "");

  const removed = "# Title\n\nAlpha one two.\n\nGamma five six.\n";
  const removedRegions = diffRegions(before, removed);
  eq(out, r, "a removal is 'removed'", removedRegions[0]?.kind, "removed");
  eq(out, r, "a removal keeps the old text", removedRegions[0]?.before.includes("Beta three four."), true);

  // A blank line inside a fence is not a block boundary; snapping to it would
  // cut a code block in half and show the reader a fragment.
  const fenced = ["Intro", "", "```js", "const a = 1;", "", "const b = 2;", "```", "", "Outro"];
  eq(out, r, "fences are not split by blank lines", snapToBlocks(fenced, 4, 4), [3, 7]);

  // ─── Inline ops ───────────────────────────────────────────────────────
  const i = "Inline";
  const ops = inlineOps("The quarterly numbers look wrong.", "The quarterly numbers look right.");
  eq(out, i, "shares the unchanged prefix", ops[0]?.kind, "equal");
  eq(out, i, "marks only what moved", ops.filter((o) => o.kind !== "equal").map((o) => o.text.trim()), ["wrong", "right"]);
  eq(out, i, "identical text is one equal op", inlineOps("same", "same").length, 1);

  eq(out, i, "describes a change", describeRegions(regions), "1 passage changed");
  eq(out, i, "describes nothing", describeRegions([]), "no visible changes");

  return out;
}
