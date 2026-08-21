# A row the source has no result for is not corruption

football-data.co.uk keeps a row for a Match it has no result for, with both score cells
empty. Until 2026-08-21 the shared parser demanded a non-negative integer of every row, so
such a file could not be stored at all. This ADR records that such a row is skipped, why
it is skipped rather than stored, and the two things that deliberately did **not** change
with it.

It applies to every Competition, not to the one that met it first, which is why it is here
rather than in ticket 0037 alone.

## What happened

The first `FL1` backfill failed outright:

```
football_data:2025-26:F2.row.137.FTHG: expected a non-negative integer;
football_data:2025-26:F2.row.137.FTAG: expected a non-negative integer
```

Row 137 of `mmz4281/2526/F2.csv` is `Bastia v Red Star` of 05/12/2025, with `FTHG` and
`FTAG` both empty. It is the only such row in the six files this repo commits — `E0`,
`E1`, `F1`, `F2`, `I1`, `I2` — which is pinned by a test rather than asserted here, and
is why six previous backfills never met one. `SP1` and `SP2` are not committed and this
ADR says nothing about them.

## The decision

A row whose **two** score cells are both empty is the source saying "no result" —
abandoned, postponed, or not yet played. It is skipped: not stored, and not reported as
an issue.

Not stored, because the alternative is worse than a missing row. The only score that
could be invented for it is 0-0, and every base rate the packet prints — home wins, draws,
away wins, goals per match — is an average over exactly these rows. A result that never
happened would move all four, quietly and forever, in a section a reader has no way to
audit.

Not reported, because a fetch that fails on it stores nothing at all: one such row in
Ligue 2 cost the whole of France's history, first flight included.

## What did not change

**A row with one score and not the other still fails.** That is not a Match without a
result; it is a half-written row, and it is the shape a truncated download or a
mid-edit file takes. Keeping it a failure is what stops "skip the empties" from becoming
"skip anything awkward", and it is asserted in both directions.

**Every other check still runs on a resultless row.** The first version of this change
skipped the row outright, immediately after the `Div` check, and silently took the
`Date`, `HomeTeam` and `AwayTeam` checks down with it — so a resultless row with an
unreadable date was dropped where it used to raise. That was caught in review, and it is
the failure this ADR most wants on record, because it is invisible: a file with a broken
date reads as a shorter Season rather than as a refusal. Only the two score issues are
withheld now, and a resultless row that is broken some other way is still refused.

The `Div` check in particular is load-bearing — it is what caught football-data.co.uk
redirecting a Spanish request to Portugal — and a redirected file is a redirected file
whether or not its rows carry scores.

## Cost

One row of Ligue 2's 306 is not stored, so that division holds 305. A club's form line
can therefore reach back over a Match that is absent rather than drawn, which is the same
shape as a Season's opening weeks and needs no separate handling.

The count of stored rows is no longer the count of rows in the file. Any future check
that reads one as the other is wrong, and `F2` is the file that proves it.
