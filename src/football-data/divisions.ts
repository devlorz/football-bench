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
 * Opening a league is one entry, the same single edit migration 0022's
 * `competition_code` domain was shaped to keep at one place.
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
  ]
};

export function divisionsOf(
  competition: string
): readonly [top: Division, second: Division] | undefined {
  return BY_COMPETITION[competition];
}
