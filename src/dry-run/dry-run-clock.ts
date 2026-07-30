const DEADLINE_OFFSET = /^deadline(?:([+-])(\d+)([mh]))?$/;

const MILLISECONDS_PER_UNIT = {
  m: 60_000,
  h: 3_600_000
};

/**
 * Reads the instant a dry run should believe it is running at. Offsets are
 * expressed against the archived Gameweek's deadline because that is the only
 * landmark a past Gameweek shares with a live one — `deadline-6h` reproduces
 * the main run, `deadline+90m` reproduces a run the Lock must refuse.
 */
export function resolveDryRunInstant(
  specification: string,
  deadline: Date
): Date {
  const offset = DEADLINE_OFFSET.exec(specification);
  if (offset !== null) {
    const [, sign, amount, unit] = offset;
    if (sign === undefined || amount === undefined || unit === undefined) {
      return new Date(deadline.getTime());
    }
    const magnitude = Number(amount)
      * MILLISECONDS_PER_UNIT[unit as keyof typeof MILLISECONDS_PER_UNIT];
    return new Date(
      deadline.getTime() + (sign === "-" ? -magnitude : magnitude)
    );
  }

  const absolute = new Date(specification);
  if (Number.isNaN(absolute.getTime())) {
    throw new Error(
      `Cannot read "${specification}" as an instant; expected an ISO instant `
      + "or a deadline offset such as deadline-6h, deadline or deadline+90m"
    );
  }
  return absolute;
}
