# Ticket: The Premier League Season, replayed by a Base Model nobody seated

**What to build:** The Exhibition job, given the Premier League row and nothing else, walks
every Settled Gameweek of the Season, puts each stored Match context to `stealth/ox-alpha`
through the Entrants' own call path, and lands its Predictions in the record. It then
appears on the Premier League's readable rankings, ranked among the Entrants, labelled with
the Gameweek it ran after and carrying the recall-versus-skill caveat — while every figure
the roster publishes stays exactly where it was. Decision:
[ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md).

**Blocked by:** [0049](0049-the-seat-that-answers-before-it-replays.md) — the row has to
exist and the Base Model has to have answered once before it is asked a Season's worth of
times.

**Status:** ready-for-agent

---

## What is already known

No code changes here either. The job resolves the Settled Gameweeks itself, holds an
advisory lock so two operators cannot pay for the same calls, and asks again only where an
ask was left unfinished.

**The spend is zero and the permission is still required.** `stealth/ox-alpha` prices both
prompt and completion at `0`, so the arithmetic that usually gates a run — seats times
Fixtures times a price — comes out at nothing. CLAUDE.md's rule is about starting a run
that reaches a Base Model, and the free preview does reach one; the operator says go
before the first call, and the ask states the Fixture count rather than a cost.

**What the run is entitled to write, and what it must not touch.** The scorer writes the
readable metrics for any model holding Predictions, and computes its Comparison Anchor, its
complete-case intersection and its published intervals over `role = 'entrant'` alone. The
combined ranking drops Exhibition rows before it counts anything. Those are the facts this
ticket pins with a before-and-after, not facts it builds.

**The label is derived, never asserted.** "Ran after Gameweek N" comes from `predicted_at`
standing against the Gameweek deadlines. An Exhibition Run whose timestamps somehow did not
post-date a deadline would be a row the leaderboard refuses to show, which is the correct
failure and worth seeing once.

**A Gap here alerts nobody, and that is the design.** A Fixture whose asking ended — a
cause no Repair addresses, or the last Repair spent — is recorded and never retried by a
later run. The Gap alert's roster filter already excludes the row.

## Acceptance

- [ ] Running the job with only the model id covers every Settled Premier League Gameweek
      of the Season, resolving which ones those are from the record rather than from a
      range the operator names
- [ ] Every Prediction references the existing shared `contexts` row — same id, same hash —
      so what this Base Model saw is verifiable against what the roster saw
- [ ] Calls go out on the production path: pinned provider, fallbacks off, the Premier
      League's frozen Prompt Version, three Repairs, the same failure taxonomy, logged in
      `attempts` under trigger `'manual'` with resolved provider, model, latency and tokens
- [ ] A Fixture whose asking ended is a recorded Gap that alerts nobody and that a second
      run leaves alone
- [ ] Re-running the job changes no answered Fixture and no recorded Gap, and asks again
      only where a repairable failure left its Repairs unspent
- [ ] After the next scoring run the Premier League leaderboard shows the Exhibition Run
      ranked among the Entrants, labelled with the Gameweek it ran after, with the caveat
      shown wherever it is described
- [ ] Every roster figure — the Entrants' scores, their order among themselves, the
      Comparison Anchor, the published intervals and the Gap rates — is identical with the
      Exhibition rows present and absent
- [ ] The combined ranking counts no Exhibition row, and the FPL track is untouched
