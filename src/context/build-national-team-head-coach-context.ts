import { formatDate, NO_HEAD_COACH } from "./build-head-coach-context.js";

/**
 * One stored `national_team_head_coaches` row: who one side's list showed in
 * post on one morning, and the instant that morning's page was read.
 *
 * `observed_on` and `assumed_on` arrive as their own text rather than as
 * Dates. Both columns are a `date`, which the driver hands back as local
 * midnight, and this reader both compares and prints them -- so a deployment
 * an hour east of UTC would print an appointment a day early and date a Change
 * to the wrong morning.
 *
 * `observed_at` is the instant, and it is here for the one thing the day
 * cannot answer: whether this row was stored before the Lock (migration 0045).
 *
 * `head_coach` null is a post the list showed vacant, which is an ordinary
 * fact about a national side and never the Gap a club's missing Head Coach is
 * (ADR-0045).
 */
export interface NationalTeamHeadCoachRow {
  team: string;
  /** `YYYY-MM-DD`. */
  observed_on: string;
  observed_at: Date;
  head_coach: string | null;
  /** `YYYY-MM-DD`, and null exactly where `head_coach` is. */
  assumed_on: string | null;
}

export interface BuildNationalTeamHeadCoachContextOptions {
  deadline: Date;
  homeTeam: string;
  awayTeam: string;
  headCoaches: NationalTeamHeadCoachRow[];
}

/**
 * What the list showed, in the words the section uses for it either way. A
 * vacancy is rendered as one and never as the previous holder, which is the
 * whole of story 37 of spec 0027: a packet that named a Head Coach who has
 * left would be wrong about the one fact this section exists to state.
 */
function holder(row: NationalTeamHeadCoachRow): string {
  return row.head_coach ?? "vacant";
}

/**
 * A side's own snapshots, oldest first. By the day and by code point, because
 * the rendered context is hashed and kept as the evidence of what an Entrant
 * was handed, so an order that depends on the database's mood is not an order
 * at all. One row per side per day is the store's key, so the day is a total
 * order on its own.
 */
function snapshotsOf(
  rows: NationalTeamHeadCoachRow[],
  team: string
): NationalTeamHeadCoachRow[] {
  return rows
    .filter((row) => row.team === team)
    .sort((left, right) => left.observed_on < right.observed_on ? -1 : 1);
}

/**
 * A side's block: who the list shows in post with the date it says they took
 * the role, and under it every morning the list changed its mind.
 *
 * Both sides always render, because both always have a Head Coach line -- a
 * name, a vacancy, or an announced Gap -- so no packet can reach a reader with
 * a heading and nothing under it (ADR-0045).
 *
 * A side whose snapshots all agree carries no Change line at all. The absence
 * of the event is the fact, and keeping a Head Coach is ordinary.
 *
 * Every disagreement is rendered and not only the latest, because two changes
 * inside the window are two things that happened and a section showing one of
 * them would be a section that quietly picked.
 */
function sideSection(
  rows: NationalTeamHeadCoachRow[],
  team: string
): string[] {
  const snapshots = snapshotsOf(rows, team);
  const latest = snapshots.at(-1);
  const changes = snapshots
    .slice(1)
    .flatMap((row, index) => {
      const before = snapshots[index] as NationalTeamHeadCoachRow;
      // Dated by the morning the new answer was first read and not by the
      // day the seat actually changed hands, which this source never states
      // (story 35 of spec 0027). The `Assumed role` date above says the
      // second thing; saying it twice here would claim this record saw it.
      //
      // "First read" is therefore the first morning that *stored* a snapshot,
      // which is not quite the first morning the page said it: a run whose
      // parse refused, or whose fetch never reached the page, leaves no row,
      // and a Change spanning that gap is dated to the next morning that
      // succeeded. It is late rather than wrong, and the alternative -- dating
      // it to a day this record did not read -- would be the wrong one. The
      // window line above states when reading began and does not state this;
      // saying it in the packet would spend an Entrant's attention on the
      // record's uptime.
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
        ? "Head Coach: vacant; the list names nobody in post."
        : `Head Coach: ${latest.head_coach}, in the role since `
          + `${formatDate(latest.assumed_on as string)}`,
    ...changes
  ];
}

/**
 * Both sides' Head Coach with the Changes this record has seen beneath, for a
 * Competition whose registry entry names the current national team head
 * coaches list (ADR-0045, ADR-0057).
 *
 * The cup's section instead of the league one and not beside it: that section
 * is built on a Season article's Managerial changes table, which states a
 * manner and two dated events per change and covers clubs only. This source
 * publishes no event at all -- it is a list of who is in post today -- so a
 * Change here is the difference between two mornings of it, and the two
 * sections have no row shape in common.
 *
 * One section and not two, on ADR-0045's terms: an Entrant is answering one
 * question -- who picks this side, and did that recently change -- and
 * splitting it across two headings makes it read two places to assemble one
 * fact.
 */
export function buildNationalTeamHeadCoachContext(
  options: BuildNationalTeamHeadCoachContextOptions
): string {
  // The bound the store cannot hold for itself. `head_coaches` has a trigger
  // pair for this, and a row here has no Gameweek for such a trigger to find a
  // deadline through (migration 0045), so this filter is the only thing
  // standing between an Entrant and a page read after its Lock. It is on the
  // instant and not on the day: the fetch runs in the morning and a Lock falls
  // in the afternoon, so the day they share is the ordinary case rather than
  // the edge one.
  const headCoaches = options.headCoaches.filter(
    ({ observed_at: observed }) => observed < options.deadline
  );
  // Read off the rows and not off a constant, because it is a fact about this
  // record rather than about the source: the list has been published for
  // years and this record has been reading it since the day the fetch first
  // ran. Stating it is what makes the silence about anything earlier honest
  // rather than a claim that nothing happened (story 35 of spec 0027).
  const firstRead = headCoaches
    .map(({ observed_on: observed }) => observed)
    .sort()[0];
  return [
    "Head Coach and changes:",
    ...firstRead === undefined
      ? []
      : [
        `A change is visible from ${formatDate(firstRead)}, when this list was `
        + "first read here; one before that is not."
      ],
    ...sideSection(headCoaches, options.homeTeam),
    ...sideSection(headCoaches, options.awayTeam)
  ].join("\n");
}
