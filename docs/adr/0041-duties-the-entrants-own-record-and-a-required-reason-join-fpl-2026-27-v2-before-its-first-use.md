# Duties, the Entrant's own record, and a required reason join fpl/2026-27-v2 before its first use

Three additions to the FPL track, amended into `fpl/2026-27-v2` in place — same version
string, seats untouched — through the door ADR-0026 holds open: a Prompt Version no context
has used may still be amended, and production holds no FPL context while the Season's first
Lock is 2026-08-21T17:30Z. They share one boundary rule: **facts cross between the record
and an Entrant in both directions; judgments and memory do not.** Set-piece and penalty
duties join the context (facts about the world), the Entrant's own record joins the context
(facts about itself), and the action gains a required reason going the other way (stored,
never scored, never returned).

The amendment closes under a **ship-or-freeze rule**. The gate is the work merged,
`fpl:rehearse` green and the pre-cron checklist walked before the Lock's cron takes over;
whatever is frozen when the Lock arrives is the Season's version, and anything unfinished
waits for the next one. Nobody holds a Season open for a feature, and nobody amends past
the gate.

The two questions this ADR settles beyond the duties were found undecided in review rather
than decided-no: whether the FPL action collects a rationale as the Match track's
Prediction always has, and whether an Entrant is ever told how its own Season is going. Two
specs wrote two action shapes apart, and nobody had put them side by side.

## Set-piece and penalty duties join the pool

FPL's bootstrap names each club's known takers — `penalties_order`,
`direct_freekicks_order`, `corners_and_indirect_freekicks_order` — and the archive already
holds them: all 34 archived bootstraps (2026-07-29 onward) carry all three fields,
populated for roughly 60–80 of ~590 players in every snapshot. That sparseness is the
source's own shape — FPL lists known takers and stays silent otherwise — and it keeps the
signal on ADR-0018's side of the line: a first-choice penalty taker is a raw fact that
still requires reasoning, because one who does not start returns nothing.

The projection follows `short_name`'s (migration 0029): nullable columns on `fpl_players`,
written by the Lock from the same bootstrap, rendered as optional keys on the pool line.
One difference is recorded: 0029 refused to backfill because there was no second record to
recover a code from. Here there is — the archive holds every bootstrap a Lock read — so
filling rows written before the migration is reading the record, not inventing it. It is
still not done now: no reader reads a historical duty, and a backfill without a reader is
rows written to gather dust. The legitimacy is what this paragraph preserves.

## The context reads the Entrant its own record

Today the context shows the Manager State but nothing of how it came to be worth what it
is. An Entrant is not told its points and is not shown the Team Sheet it locked — so it
cannot know whom it captained, and cannot evaluate the one decision the armband doubles. It
can almost reconstruct its result from what it does see (its Squad, the pool's per-player
windows), but the starters, the bench order and the multiplier are exactly the parts it
cannot — the same misattribution the dashboard's `armband` field exists to prevent a human
reader making. A real FPL manager sees their score the moment a Gameweek ends, and a track
built to measure recovery (spec 0003) otherwise starves its Entrants of the one signal that
says recovery is needed.

So the context renders, in the Manager State block: the latest Settled Gameweek's own Team
Sheet with what each pick returned and what the armband contributed, and the Season's
points to date. All of it is read off `fpl_player_points` and the stored Manager State —
the record read back to its owner, not a judgment about it.

The block **names the Gameweek it reads, always** — "Gameweek 3", never "last Gameweek" —
because the two are not the same thing: after a Gap the latest Settled Gameweek sits
further back, and a block that said "last" would be quietly wrong in exactly the way this
repo's dashboards refuse to be (`transfersSinceGw` is the precedent). At the opening there
is nothing to read and the block says so, in the same sentence family as "No Gameweek has
settled yet". A Rolled Over Gameweek renders the Team Sheet that stood, because that is the
Sheet that played and earned the points beside it.

What stays out, deliberately: every other seat's totals and any ranking — interaction
between seats is out of spec 0003's scope, and a seat shown the field is playing rank
defence, a different task — and any digest of the numbers ("you are scoring badly"), which
is ADR-0018's line crossed from a new direction.

## The action carries a required reason back

The Match track has required a `rationale` per Prediction since spec 0001 —
`z.string()` in its schema, stored, never scored — and the FPL action never asked. The FPL
action's schema now requires one too: a response without it fails as the `schema` kind and
costs a Repair, exactly as it does on the Match track, which keeps ADR-0010's claim — that
attempts-to-valid has one definition across both tracks — true in both directions.

Stored beside the Gameweek's record on `manager_states`, nullable, null only for a Rolled
Over Gameweek, which reached no legal action to explain; a refused action's reasoning
already lives verbatim in `attempts.raw_response`. **Never scored, and never rendered into
any later context.** The last clause is the load-bearing one. Read back, the rationale
becomes the memory channel this track deliberately does not have: a plan carried forward is
adherence being measured, not management — the same reasoning spec 0003 uses for not
telling an Entrant which Repair it is on. Written out and never returned, it is what it is
on the Match track: the qualitative record beside the quantitative one, and when a Season
path goes wrong, the difference between observing a recovery and guessing at one.

## Considered Options

- **Waiting for the next Prompt Version** — this ADR's own first draft recommended it, on
  the rush risk: three days from a Season lock, a projection migration, a render change and
  a schema change is how a mistake gets frozen for thirty-eight Gameweeks. Overruled with
  the risk priced rather than dismissed: a full Season in which no Entrant can see that it
  needs to recover costs the track's central measurement more than the window risks, and
  the window is bounded by the rehearsal gate above, not by hope.
- **Bumping to `fpl/2026-27-v3` instead of amending** — rejected: the same bytes under a
  new name, plus a roster re-entry to move ten seats' `prompt_version`, three days before
  the Lock. The door ADR-0026 opened is the in-place amendment.
- **An optional rationale** — rejected: Base Models that omit it would omit it
  systematically, putting Base-Model-correlated holes in the record; and optional would
  quietly fork the two tracks' definitions of a valid response.
- **Strategy guidance in the prompt** — the imported-prompt proposal that raised all of
  this. Rejected on ADR-0018 unchanged: advice is the extreme of the digested answer, and
  every Entrant parroting one author's strategy collapses the differences the benchmark
  exists to measure.
- **A plan field carried into later Gameweeks** — rejected: everything a plan would
  preserve is re-derivable from every Gameweek's own context, so a remembered plan adds
  only the obligation to follow it.
- **Scoring or judging the rationale** — rejected: a prose metric no rule of the game
  backs. "Stored, never scored" is the whole reason collecting it is safe.
- **Deciding nothing** — rejected: undecided-but-observable questions cost every future
  reader the same archaeology that found these.

## Consequences

- **The freeze that moves is the version's tests, not a sha.** The FPL track pins no
  rendered-context sha the way `MATCH_PROMPTS` does; its freeze is the version string and
  the render tests over `buildFplTrackContext`. The amendment moves those tests with it,
  and `fpl:rehearse` replays the whole loop — build, call, validate, store — before the
  Season does. That rehearsal is the gate, and it is why the amendment is safe to make at
  all.
- No Entrant ever plays under the unamended v2 — the amendment lands before the first
  context is built — so no seat's task changes mid-path. Asking for a reason can still
  change the decision itself (a model made to justify may choose differently); accepted,
  because every seat plays the whole Season under the same asking, and the Match track
  always has.
- The context grows and the action grows, on the track spec 0003 already calls several
  times the Match track's cost. Measured from `attempts` after Gameweek 1, per that spec's
  own rule; not estimated here.
- The seed exercises every new surface: a seeded duty, a stored rationale, and the
  own-record block across the seeded Gameweeks — including the Gameweek-named form after
  the seeded Gap and the standing Sheet after the seeded Roll Over.
- The Exhibition replay splices the Manager State block, and the own-record now lives
  inside that block — deliberately, so a replayed newcomer is shown its own record and
  never the donor's. Its scored rows do not exist at replay time (scoring follows the
  replay), so the Exhibition path computes the armband's contribution and its running
  Season total with the scorer's own pure function over the shared player points — the one
  place spec 0019's "nothing is recomputed" bends, and it bends by calling the same
  function rather than writing a second one. The splice finds the block's end at the first
  blank line, so the own-record block must never contain one.
- CONTEXT.md moves with this: **Rationale** becomes a glossary term, and **Entrant Record**
  widens to say what it holds on each track and that an Entrant may be shown its own
  Record and never another's.
- A Competition whose source publishes no duties renders the keys absent, which is already
  what the pool line means by absence; the duties ride the single-edit path
  `opening-a-competition.md` documents.
