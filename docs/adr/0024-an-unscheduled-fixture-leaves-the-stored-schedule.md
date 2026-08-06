# An unscheduled Fixture leaves the stored schedule

FPL withdraws a postponed Fixture from its calendar by setting `event = null`, and the
fetch has had no answer for it: a never-Locked row keeps its stale Gameweek and is
indistinguishable from a scheduled Fixture, and a Locked row is only flagged `deferred` — a
flag that is monotone and that also marks a Fixture legitimately moved to a new Gameweek
(ADR 0013), so it cannot double as "currently off the calendar" without hiding rearranged
Fixtures for the rest of the Season. The stale rows are not cosmetic. The FPL context's
schedule section lists such a Fixture under a Gameweek it will not be played in, and the
Blank it creates never appears — spec 0006's stories 3 and 4 fail exactly when they matter
(ticket 0006's recorded limitation). And the match track selects prediction work by
`coalesce(locked_in_gw, gw)`, so a phantom never-Locked row would be predicted, and
gap-alerted, as if the match were still to be played.

The decision splits on the Lock, the boundary the schema already draws:

- **A never-Locked Fixture FPL unschedules is deleted.** Nothing refers to it — the
  database refuses a Prediction until its Fixture is Locked (ADR 0015) — and the row holds
  nothing the feed cannot rebuild: if FPL restores the Fixture, the next fetch re-inserts
  it under its new Gameweek. This is the one place the write path deletes what it wrote,
  and it deletes only what was never part of the record of play.
- **A Locked Fixture FPL unschedules keeps its row and gains `unscheduled = true`** — a new
  column meaning exactly "currently off FPL's calendar". It is deliberately not monotone:
  FPL naming a new date clears it, because it reports the live calendar where `deferred`
  records history. The Fixture's Predictions, its locked Gameweek and ADR 0013's whole
  deferral story are untouched — a post-Lock removal still sets `deferred`, which keeps its
  single meaning of "was moved off its locked Gameweek after the Lock".

Schedule readers filter on `unscheduled` instead of guessing from columns that answer
other questions.

## Considered options

- **Overloading `deferred`** was rejected before this ADR was opened: it is monotone and
  already marks Fixtures legitimately moved to a new Gameweek, so filtering the schedule on
  it would permanently hide the rearranged Fixture that *creates* a Double
  (`test/fetch-fpl-gameweek.test.ts:292` and `:378`).
- **Fixing it where the schedule is read** is impossible, not merely rejected: the read
  cannot tell a stale row from a scheduled one, because the fetch stores nothing that
  distinguishes them. That is the limitation, not a solution to it.
- **Nulling `gw` or pointing it at a sentinel Gameweek** was rejected: `gw` is non-null
  with a foreign key to `gameweeks`, and a sentinel row would corrupt every join that
  treats `gameweeks` as the calendar.
- **Keeping never-Locked rows and flagging them too** was rejected: a row for a match with
  no Prediction, no Lock and no calendar slot is dead weight that every reader — the
  schedule, the prediction run, the gap alert — would need to remember to filter, forever.
  Deletion makes the mistake impossible rather than merely detectable.
