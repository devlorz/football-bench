/**
 * The `manager_states` row the opening fixture Squad produces, as the database
 * holds it.
 *
 * It lives here rather than beside either persistence suite because two of
 * them assert it — the nine-way opening that writes it, and the later Gameweek
 * that carries it forward — and a Squad that meant one thing in one file and
 * something else in the other would let a real change pass in whichever file
 * was not updated.
 *
 * Every value is written out rather than computed. Deriving them from
 * `legalStateFrom(OPENING_ACTION)` would assert the reducer against itself and
 * agree with any answer it gave; these are hand-read off `fpl-pool-fixture.ts`:
 * the fifteen at their opening prices, £95.5m spent of £100.0m, and the Team
 * Sheet the opening action names.
 *
 * Note the column shapes are not the reducer's. `squad` and `team_sheet` are
 * JSONB and keep their camelCase keys; everything around them is a column.
 */
export const STORED_OPENING_STATE = {
  squad: {
    active: [
      { fplId: 1, purchasePriceTenths: 45 },
      { fplId: 2, purchasePriceTenths: 40 },
      { fplId: 3, purchasePriceTenths: 60 },
      { fplId: 4, purchasePriceTenths: 55 },
      { fplId: 5, purchasePriceTenths: 50 },
      { fplId: 6, purchasePriceTenths: 45 },
      { fplId: 7, purchasePriceTenths: 40 },
      { fplId: 8, purchasePriceTenths: 120 },
      { fplId: 9, purchasePriceTenths: 90 },
      { fplId: 10, purchasePriceTenths: 75 },
      { fplId: 11, purchasePriceTenths: 55 },
      { fplId: 12, purchasePriceTenths: 45 },
      { fplId: 13, purchasePriceTenths: 105 },
      { fplId: 14, purchasePriceTenths: 70 },
      { fplId: 15, purchasePriceTenths: 60 }
    ],
    free_hit_stash: null
  },
  team_sheet: {
    starters: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14],
    bench: [2, 7, 12, 15],
    captain: 8,
    viceCaptain: 13
  },
  /** £100.0m less the £95.5m Squad above. */
  bank: 45,
  /** The one an opening is granted, none of it spent on the opening fifteen. */
  free_transfers: 1,
  /** The opening fifteen are not Transfers beyond an allowance. */
  hits: 0,
  chips_used: { firstHalf: [], secondHalf: [] },
  chip_active: null,
  rolled_over: false,
  attempts_used: 0
};

/**
 * The same row with whatever a scenario actually changed named explicitly, so
 * a test says what is different about it and nothing else.
 */
export function storedState(
  changed: Partial<typeof STORED_OPENING_STATE> & Record<string, unknown> = {}
): Record<string, unknown> {
  return { ...STORED_OPENING_STATE, ...changed };
}
