# Three seats leave the FPL track before its first Lock

The FPL track's opening refused three times on the evening of 2026-08-20, and the same
three seats produced no legal opening action every time. This ADR withdraws them from the
FPL track's Season Roster, leaves the Match track's ten seats untouched, and records what
that costs. The door it walks through is ADR-0034's: the Season Roster is what stands at
the first Lock, and until 2026-08-21T17:30Z there is no FPL Season to remove anybody from.

## What was measured

Three runs, `FPL_CONCURRENCY` at its default of ten each time. Seven seats hold a legal
opening on record; these three do not:

| Seat | Run 1 (18:22Z) | Run 2 (18:53Z) | Run 3 (19:02Z) |
|---|---|---|---|
| `fpl/glm-5.3` | timeout, 300,008 ms | timeout, 300,013 ms | timeout, 600,011 ms |
| `fpl/qwen3.8-max` | timeout, 300,005 ms | timeout, 300,005 ms | timeout, 599,994 ms |
| `fpl/minimax-m3` | length, 16,000 out | length, 32,000 out | length, 32,000 out |

Two different failures. GLM and Qwen return nothing at all — no usage, no body, our own
abort — through a five-minute window and then a ten-minute one, against a prompt the seats
that answered read in 267 and 271 seconds. MiniMax answers well inside the clock and
spends every output token it is given on reasoning: 16,000 of 16,000, then 32,000 of
32,000, `content` null each time, roughly five cents of nothing. Ticket 0026 doubled the
ceiling on the first of those and wrote the reading of a second: "a seat that spent 16,000
without finishing may spend 32,000 without finishing... a finding about the seat rather
than a number to raise." This is that second.

## The two rosters diverge, and the vocabulary has to admit it

CONTEXT.md defines the Season Roster as "One per track" and then says "The roster itself is
one roster — what multiplies is seats, not Entrants." Both were true while both tracks
seated the same ten Base Models. They cannot both survive this decision.

The per-track reading is the one that holds. A Season Roster is the set of Entrants a
track's comparisons are computed over, and the FPL track's comparisons are its own: a Base
Model that cannot open a Squad is not an Entrant on that track, whatever it does on the
Match track, where it predicts inside a prompt a fraction of this one's size and has been
answering. The sentence about one roster described a coincidence of the 2026-27 Season's
first day, not a rule, and it is amended rather than defended.

What stays unrepresentable is what ADR-0011 already forbids: no exclusion **within** a
track, no seat that plays some Gameweeks and not others, no week-by-week judgement. This is
one decision, taken before the track opens, applied to the whole Season.

## Storage representation

CONTEXT.md requires a removal to have one, and deleting the rows is not it. `attempts` and
`contexts` both carry `references models(id)`, and both hold rows for these three seats from
tonight — the very rows the table above is read from. A deletion would either be refused by
the foreign keys or, forced through, would destroy the evidence this decision rests on.

So the rows stay and gain a date: **`models.withdrawn_at`**, null for every seat that
stands. The FPL roster read adds `and withdrawn_at is null`; the seat keeps its id, its
Base Model, its attempts and its contexts, and the record says when it left. The Match
track's read does not filter on it, which is what keeps ten seats predicting there.

The count guard in `startFplTrack` stops being `SEASON_ROSTER_SIZE`. It exists so that a
roster of the wrong size cannot open a Season that is not the one this project describes,
and that guard is still wanted — measured against the FPL track's own expected size, which
this ADR sets at **seven**.

## What it costs, stated rather than discovered later

- **The FPL track ranks seven Base Models and the Match track ten.** Every cross-track
  reading carries that difference from now on, and the dashboard shows two different n.
- **The class mix shifts** from ADR-0034's three Frontier, two first-party, five
  open-weight to three, two and two. The open-weight side loses three of its five, which is
  the side of the roster this benchmark exists to keep in the picture.
- **It is irreversible for the Season.** ADR-0034 closes the door at the first Lock; a
  withdrawn seat returns only as an Exhibition Run (ADR-0032), which supports no claim of
  forecasting skill.

## Considered options

- **`FPL_CONCURRENCY=1`, and it has not been tried.** All three runs went out ten-wide,
  and `readScheduledFplJobConfig`'s own comment records that "every one of ticket 0023's
  timeout Gaps came from a ten-wide burst and none from pre-flight, which calls one seat at
  a time." That is the lever aimed exactly at GLM's and Qwen's failure and nobody has pulled
  it; it costs thirty minutes against a decision that cannot be undone this Season. This ADR
  is therefore written to be read narrowly: **if a one-at-a-time run opens GLM and Qwen, the
  withdrawal is MiniMax's alone and the table above becomes the record of why the other two
  looked broken.** Nothing here is a finding about a Base Model that was never asked
  politely.
- **Raising the output ceiling again** was rejected by ticket 0026's own sentence, on two
  data points that show MiniMax spending whatever it is given rather than needing a
  particular number.
- **Sending OpenRouter a `reasoning` cap** for MiniMax was rejected here, not dismissed: the
  request envelope carries no such parameter today, it is shared by the FPL track, the Match
  track and pre-flight, and adding one for a single seat changes the terms that seat plays
  under against the other nine. That is its own ADR with its own measurement, and it is the
  first thing to reach for next Season.
- **Deleting the `models` rows**, as ADR-0034 did for Qwen3.7 and Grok 4.5, was rejected:
  that ADR could delete because "no stored fact yet references" those rows. Tonight's do.
- **Opening at Gameweek 2 instead** was rejected. The seats fail on the prompt, not on the
  date, so Gameweek 2 buys the same refusal a week later and costs every Entrant its first
  Gameweek.
- **Not opening the FPL track this Season** was rejected: seven Season paths are worth more
  than none, and the track is the half of this benchmark that no other public ranking runs.
