/**
 * How many Entrants a Season is run with (ADR-0014): three frontier Base
 * Models, one more first-party and five open-weight.
 *
 * It is a fixed number rather than whatever the `models` table happens to
 * hold, because the roster size is a recorded decision and half the results
 * are read against it — ADR-0011's complete-case intersection, ADR-0016's
 * eight comparisons against the leader, and the FPL track's demonstration of
 * one season path per Base Model. A track that quietly started eight would
 * produce all of those numbers and none of them would mean what they say.
 */
export const SEASON_ROSTER_SIZE = 9;
