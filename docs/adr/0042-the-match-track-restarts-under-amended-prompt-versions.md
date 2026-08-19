# The match track restarts under amended Prompt Versions

ADR-0038 kept the Premier League's `match/2026-27-v2` untouched on the recorded ground
that the version had been used. The production record says otherwise: as of 2026-08-19
the only match-track contexts stored for 2026-27 are La Liga's Gameweek 1 — six
contexts built 2026-08-15 and sixty Predictions, all under `match-pd/2026-27-v1` — and
not one row under the Premier League's version. ADR-0026's boundary is the stored
context, not the recorded intention: the freeze binds at first use, and `match/2026-27-v2`
has had none. So the sentence in ADR-0038 is overturned by the mechanism it appealed to,
and the Premier League's version is amendable until its first Lock,
2026-08-21T17:30Z.

The decision: the match track restarts, both Competitions together, under one amended
template — the Premier League by amending `match/2026-27-v2` in place (the ADR-0041
precedent), La Liga by freezing `match-pd/2026-27-v2` from the same template for
Gameweek 2 onward. What the amendment carries is decided in ADR-0043 and ADR-0044; this
ADR decides the restart itself and what it does to the record, the seats and the clock.

## La Liga's Gameweek 1 stays on the record

`match-pd/2026-27-v1` was used and is unamendable; nothing here touches it. Its
Gameweek 1 is kept whole, not merged:

- **Scored before the flip.** The scorer selects seats by the Prompt Version the code
  names for the Competition, so the moment the constant moves to v2, the v1 seats fall
  out of every run forever. Gameweek 1 is therefore scored under v1 — Match Points, Bet
  Points, RPS — before the amendment merges. A record without its numbers is half a
  record, and this window closes permanently at the flip.
- **Shown frozen, labelled.** The La Liga dashboard page carries one block — "Gameweek 1
  — played under match-pd/2026-27-v1, before the restart" — listing each v1 seat's
  Gameweek 1 Match Points, Bet Points and RPS. No intervals and no Comparison Anchor: one
  Gameweek supports no claim, and the block is separate from the leaderboard, which
  begins at Gameweek 2.
- **Never merged.** Season scoring — complete-case intersections, Comparison Anchors,
  cumulative snapshots — starts fresh at the restarted versions' first scored Gameweek.
  Numbers earned under two different questions do not share a column.

## The roster window reopens

ADR-0034 closed the Season Roster at the Season's first Lock, and that Lock — La Liga's
Gameweek 1 — has passed. But the roster rule exists to pin who competes under a frozen
question, and the restart retires that question before all but one Gameweek of it was
asked. So the window reopens with the versions: seats under the restarted versions may
differ from v1's ten until the restarted versions' first Lock, and whatever stands at
that Lock is the Season Roster for every Competition — one roster, exactly as ADR-0038
holds it. One expected use: the GLM seat may move to GLM 5.3. After that Lock, ADR-0034
applies unchanged and a late Base Model is an Exhibition Run (ADR-0032).

## The clock is a hard boundary

Everything the restart carries must be deployed before the earliest restarted Lock —
the Premier League's 2026-08-21T17:30Z, or La Liga's derived Gameweek 2 Lock if it
falls earlier. A prediction run that fires first renders the old text and freezes it,
and the whole amendment dies for the Season. This is why ADR-0044 carries its own
cutoff and ADR-0043's additions, which need no new data, land first.

## Considered options

- **Amending the Premier League only, leaving La Liga's v1 running** — rejected. The
  Prompt Version is a frozen (template + context builder) pair and the builder is one
  code path for both leagues; La Liga's later Gameweeks would either re-render changed
  under a frozen version (a violation) or the builder would carry two formats all
  season behind an exemption to ADR-0038's shared question.
- **Deferring the amendment to the next version boundary** — rejected. The additions are
  early-season-shaped: they anchor Entrants precisely where samples are smallest.
  Deferred, their value arrives at Gameweek 1 of 2027-28.
- **Counting La Liga's Gameweek 1 into the restarted scoring** — rejected, as above:
  it was asked a different question.

## Consequences

- ADR-0038's premise sentence is overturned as recorded here; the constants' comment in
  `openrouter-entrant.ts`, which repeats it, is corrected with the amendment.
- `models` grows ten (or, if the window is used, a different count of) seats under
  `match-pd/2026-27-v2`. The v1 seats keep their rows and their Gameweek 1; every
  roster read already filters by Prompt Version, so they vanish from runs, alerts and
  leaderboards with no further code. The frozen block is the one surface that reads
  them, deliberately and by the retired version's name.
- An Exhibition Run over La Liga's Gameweek 1 replays under v1, per ADR-0032: it reads
  the stored contexts, and those are v1's.
