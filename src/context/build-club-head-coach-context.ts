import { formatDate, NO_HEAD_COACH } from "./build-head-coach-context.js";

/**
 * One stored `club_head_coaches` row: who one club's infobox named on one
 * morning, and the instant it was read (ADR-0063). `observed_on` arrives as
 * text for the reason the national-team row's does: a `date` handed back as
 * local midnight prints a day out on either side of UTC.
 *
 * `head_coach` null is an infobox that named nobody, a vacancy or a field this
 * record could not read (spec 0028, story 38).
 */
export interface ClubHeadCoachRow {
  team: string;
  /** `YYYY-MM-DD`. */
  observed_on: string;
  observed_at: Date;
  head_coach: string | null;
}

export interface BuildClubHeadCoachContextOptions {
  deadline: Date;
  homeTeam: string;
  awayTeam: string;
  headCoaches: ClubHeadCoachRow[];
}

/**
 * Frozen with the cup's Prompt Version (ADR-0063, story 42): the infobox
 * states no appointment date, and an Entrant must not read the missing
 * "since" as a missing change.
 */
export const NO_APPOINTMENT_DATE =
  "Each club's English Wikipedia infobox names who picks the team and states "
  + "no appointment date, so a Head Coach line says who and not since when.";

const holder = (row: ClubHeadCoachRow): string =>
  row.head_coach ?? "nobody named";

/**
 * A side's block: the latest snapshot's Head Coach, and under it every
 * consecutive pair of snapshots that disagrees (migration 0045's model), each
 * dated by the first morning that showed the change. The national-team
 * builder's pass, written in parallel rather than shared: the two lines above
 * it differ, and nothing yet forces both to change at once.
 */
function sideSection(rows: ClubHeadCoachRow[], team: string): string[] {
  const snapshots = rows
    .filter((row) => row.team === team)
    .sort((left, right) => left.observed_on < right.observed_on ? -1 : 1);
  const latest = snapshots.at(-1);
  const changes = snapshots.slice(1).flatMap((row, index) => {
    const before = snapshots[index] as ClubHeadCoachRow;
    // Dated by the first morning that *stored* the new answer, which is late
    // rather than wrong where a run failed in between: a day with no row is a
    // day this record did not read, and dating a Change to it would claim it
    // had.
    return holder(before) === holder(row)
      ? []
      : [
        `Change: ${holder(before)} to ${holder(row)}, `
        + `first read ${formatDate(row.observed_on)}`
      ];
  });
  return [
    "",
    team,
    latest === undefined
      ? `Head Coach: ${NO_HEAD_COACH}`
      : latest.head_coach === null
        ? "Head Coach: none named; the club's infobox names nobody."
        : `Head Coach: ${latest.head_coach}`,
    ...changes
  ];
}

/**
 * Both sides' Head Coach with the Changes this record has seen, for a club
 * cup whose registry entry names the clubs' infoboxes (ADR-0063).
 *
 * The store has no trigger holding the Lock (migration 0050 keys it by side
 * and day, with no Gameweek to find a deadline through), so the bound is here,
 * on the instant: the fetch runs in the morning and the Lock in the afternoon.
 */
export function buildClubHeadCoachContext(
  options: BuildClubHeadCoachContextOptions
): string {
  const headCoaches = options.headCoaches.filter(
    ({ observed_at: observed }) => observed < options.deadline
  );
  const firstRead = headCoaches
    .map(({ observed_on: observed }) => observed)
    .sort()[0];
  return [
    "Head Coach and changes:",
    NO_APPOINTMENT_DATE,
    ...firstRead === undefined
      ? []
      : [
        `A change is visible from ${formatDate(firstRead)}, when the `
        + "infoboxes were first read here; one before that is not."
      ],
    ...sideSection(headCoaches, options.homeTeam),
    ...sideSection(headCoaches, options.awayTeam)
  ].join("\n");
}
