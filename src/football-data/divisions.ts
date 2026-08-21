/**
 * The two football-data.co.uk divisions a Competition's history is read
 * through: its top flight, whose current Season is the league table and every
 * record line, and the one below it, where a promoted club spent the prior
 * Season (ADR-0037).
 *
 * One list, read by both the fetch that stores the rows and the context that
 * renders them. Two lists would let a Competition be fetched under names the
 * context does not select on, and neither half would be wrong on its own: a
 * full backfill would render as an empty table with nothing to alert on. A
 * Competition absent here therefore cannot have rows either, which is what
 * lets the context treat "no divisions" as "no history yet" rather than as
 * history it has lost.
 *
 * Opening a league is one entry here **and one migration** widening
 * `historical_matches`' division check to the two names that entry adds — the
 * same shape migration 0022's `competition_code` domain has, where the
 * vocabulary lives in one place per side of the boundary rather than once
 * overall. The duplication is deliberate: the check is what stops this list
 * from being edited out from under rows already stored by an older spelling,
 * and a constraint cannot read a TypeScript module. Two edits, in one change,
 * and a mismatch is refused at write time rather than discovered in a packet.
 *
 * Two of seven, counting the whole change: `docs/runbooks/opening-a-competition.md`
 * has the list.
 */
export interface Division {
  code: string;
  name: string;
}

const BY_COMPETITION: Readonly<
  Record<string, readonly [top: Division, second: Division]>
> = {
  PL: [
    { code: "E0", name: "Premier League" },
    { code: "E1", name: "Championship" }
  ],
  // "La Liga" and not "LaLiga" or "Primera División": the top flight's name is
  // rendered into the same packet as `MATCH_PROMPTS.PD.competitionName`, and
  // `test/openrouter-entrant.test.ts` requires the two to agree rather than
  // let one packet call one league two things.
  PD: [
    { code: "SP1", name: "La Liga" },
    { code: "SP2", name: "Segunda División" }
  ],
  SA: [
    { code: "I1", name: "Serie A" },
    { code: "I2", name: "Serie B" }
  ],
  FL1: [
    { code: "F1", name: "Ligue 1" },
    { code: "F2", name: "Ligue 2" }
  ]
};

/**
 * Every Competition this list curates, which is not the same set as the
 * Competitions with a frozen Prompt Version and must not be read as one. The
 * two agree today and `test/openrouter-entrant.test.ts` requires that they
 * keep agreeing, but the constraint above answers to *this* list: an entry
 * added here ahead of its freeze still needs the migration, and a schema test
 * reading the prompt list instead would stay green over the gap.
 * **Found by review.**
 */
export const CURATED_COMPETITIONS: readonly string[] =
  Object.keys(BY_COMPETITION);

export function divisionsOf(
  competition: string
): readonly [top: Division, second: Division] | undefined {
  return BY_COMPETITION[competition];
}
