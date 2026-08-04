/**
 * Runs `work` over every item, at most `concurrency` at a time, and rejects
 * with the first failure once every worker has stopped.
 *
 * Settled rather than raced. A worker whose database write failed must not
 * leave its peers writing into a call that has already returned — so the
 * failure is held until the last of them is done, and only then thrown.
 *
 * The items are taken from a shared cursor rather than sliced into batches, so
 * a slow item holds up nothing but itself: what the workers share is the wait,
 * which is the whole point when there is one Lock to finish inside.
 *
 * `predictGameweek` deliberately does not use this. Its loop stops early on a
 * persistence failure rather than running to the end, because an attempt
 * ledger that cannot be written makes every remaining call unrecordable — a
 * different rule, not a variation on this one.
 */
export async function eachBounded<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const item = items[next];
      next += 1;
      if (item === undefined) {
        return;
      }
      await work(item);
    }
  }

  const finished = await Promise.allSettled(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker()
    )
  );
  const failed = finished.find((result) => result.status === "rejected");
  if (failed !== undefined) {
    throw failed.reason;
  }
}
