# Spec 0010 — The cost of asking an Entrant

**Status:** ready-for-agent
**Scope:** four cost measures on the FPL track's call layer — the opening retry replays
recorded legal actions, the Entrant call timeout becomes an operator knob, every request
carries one uniform cache breakpoint, and the v2 opening line gains its missing sentence
— all landing before the season's first FPL Lock
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) · **Decisions:** [ADR 0001–0026](../adr/),
especially [ADR 0025](../adr/0025-the-opening-retry-replays-the-recorded-legal-action.md)
and [ADR 0026](../adr/0026-a-prompt-version-no-context-has-used-may-still-be-amended.md)
**Siblings:** [spec 0003](./0003-fpl-track.md) (the opening this makes retryable) ·
[spec 0006](./0006-fixtures-availability-detail-and-the-league-table-in-the-fpl-context.md)
(the v2 text this amends one line of)

---

## Problem Statement

The season's dry opening put numbers on four leaks. Obtaining nine legal opening actions
took forty-two Entrant calls across three runs, because a retry of the all-or-none
opening re-calls — and re-bills — every seat, including those whose legal answers are
already on the record. Three of nine seats died at the hard-coded two-minute HTTP
timeout on every run, each corpse forcing another full-board retry. Every Repair turn
re-sends the same ~26k-token context at full price, although seven of nine providers
would discount a cached prefix automatically and the other two would too if asked. And
two Base Models independently burned four to five Repair turns on the identical
misreading of how an opening Squad is bought. None of this is the signal the track
exists to measure; all of it is billed as if it were.

## Solution

Four moves, one theme: pay for a Base Model's decisions, not for the harness's
plumbing. A retry of the opening replays each recorded legal action through the rules
reducer instead of re-calling its seat (ADR 0025), so a failed opening converges on the
missing seats only. The Entrant call timeout becomes `ENTRANT_CALL_TIMEOUT_MS`, an
operator knob defaulting to today's 120 seconds, set long for the FPL jobs whose
opening prompt reasoning models chew on for minutes. Every request's first message ends
with one uniform `cache_control` breakpoint — the two providers that need it explicitly
start discounting, the seven that discount automatically are undisturbed, and every
seat's envelope stays identical. And the v2 opening line tells an Entrant what two of
nine had to be told by the Repair loop: the fifteen players are bought through
`transfers_in` (ADR 0026).

---

## User Stories

### The opening retry

1. As an operator, I want a retry of the opening to call only the seats without a
   recorded legal action, so that one seat's provider outage stops costing eight other
   Entrants' answers.
2. As an operator, I want the replayed action taken from the attempts record and driven
   through the full rules reducer, so that a replay is validated exactly as a fresh
   answer would be.
3. As an operator, I want the opening to stay all-or-none, so that spec 0003's decision
   that the track starts for all nine Base Models together is untouched.
4. As an auditor, I want a replayed opening to commit states identical to the ones the
   original answers would have produced, so that replay changes cost and nothing else.
5. As an auditor, I want the season-long scheduled runs left exactly as they are, so
   that the Manager-State skip that already makes re-running the fill stays the one
   mechanism it is.

### The timeout knob

6. As an operator, I want the Entrant call timeout read from `ENTRANT_CALL_TIMEOUT_MS`,
   so that a slow reasoning model is a configuration decision rather than a code change.
7. As an operator, I want the knob to default to the current 120 seconds when unset, so
   that no other caller of the shared HTTP fetcher changes behaviour.
8. As an operator, I want only the Entrant call to honour the knob, so that a hung FPL
   data fetch still fails fast.
9. As an operator, I want a malformed value refused at configuration reading, so that a
   typo surfaces at job start rather than as a mystery mid-run.

### The cache breakpoint

10. As an analyst, I want every seat's first message to end with one `cache_control`
    breakpoint, so that the providers that require explicit breakpoints join the seven
    that already discount cached prefixes automatically.
11. As an auditor, I want the breakpoint identical on every seat, so that no Entrant's
    request envelope differs from another's.
12. As an analyst, I want the real discount read from recorded attempts after the first
    Gameweek, so that the saving is a fact rather than a projection.
13. As an auditor, I want the stored context text and its hash untouched by the
    breakpoint, so that the frozen pair keeps meaning what it meant.

### The opening sentence

14. As an Entrant opening a Squad, I want the opening line to say the fifteen players
    are bought through `transfers_in` with `transfers_out` empty, so that my first
    Repair is spent on my mistakes rather than on the harness's ambiguity.
15. As an auditor, I want the sentence inside `fpl/2026-27-v2` under ADR 0026's
    first-use rule, so that the frozen-pair discipline is bounded, not broken.
16. As an Entrant in any later Gameweek, I want the sentence absent once a Squad exists,
    so that the opening instruction never muddies an ordinary week.

### Proving it

17. As a reviewer, I want a scripted opening that fails on one seat and is then retried,
    verified to re-call only that seat while replaying the rest, so that the saving is
    proven at the seam rather than asserted.
18. As a reviewer, I want a replayed action verified to fail loudly if it no longer
    passes the reducer, so that replay can never commit a stale answer silently.
19. As a reviewer, I want the request shape — breakpoint and timeout — asserted from the
    requests a scripted fetcher captures, so that what reaches the wire is what the spec
    says reaches the wire.

---

## Implementation Decisions

### Replay reads the record it already has

A seat qualifies for replay when the attempts record holds a legal (ok) attempt for the
Gameweek. The accepted action is recovered by parsing the recorded raw response at the
point of use — the response body is stored byte-for-byte, and nothing else persists the
action — and driven through the same validate-and-apply path as a live answer. No
migration, no new column, no foreign key: byte-equality of the retried context is
guaranteed by the store's insert-or-nothing write, which is what makes the replayed
answer an answer to the same question (ADR 0025). The scheduled weekly path is not
touched; its Manager-State skip already is this policy.

### One knob, wired only where it is needed

`ENTRANT_CALL_TIMEOUT_MS` is read by the FPL job configurations and handed down to the
Entrant call alone, overriding the fetcher's per-request timeout. Unset means 120
seconds — today's behaviour, and the fetch paths keep it unconditionally. The name is
track-agnostic so the Match track can adopt it if its prompts ever grow; wiring it there
now was declined, as its per-Fixture prompts have never approached the ceiling.

### The breakpoint is uniform and semantically inert

The first message's content gains one trailing `cache_control` breakpoint on every seat
alike. Providers that cache implicitly ignore it; the two that require it begin
discounting; none alters a completion. The stored context text, its hash, and the
Prompt Version are untouched — the breakpoint lives in the request envelope, which the
frozen pair has never governed. Expected savings concentrate in Repair chains, whose
turns re-send the full prefix within the minute-scale cache lifetimes; savings across
runs spaced hours apart are not expected, and the opening replay exists for exactly
those. Cost is measured from recorded attempts per spec 0003's standing rule, never
estimated.

### The sentence rides the existing branch

The builder's opening line — rendered only while the Squad is empty — becomes:

> Squad: none yet — this is your opening Squad. Buy all fifteen players through
> transfers_in; transfers_out stays empty.

No new branch, no rule-list change, no other wording touched. The change lands inside
`fpl/2026-27-v2` before the season's first Lock under ADR 0026's first-use rule; if a
Lock arrives first, it ships as a v3 instead.

---

## Testing Decisions

A good test asserts external behaviour at an existing seam — the calls a scripted
fetcher receives, the rows a run commits, the stored context text — never the private
steps between. No new seam is introduced; four existing ones carry everything:

- **`startFplTrack` through scripted HTTP and a real Postgres**, the converging seam: a
  first run that fails on one seat, then a retry asserted to call only that seat, replay
  the others from the record, and commit nine states identical to fresh-answer states.
  The loud-failure path: a recorded action doctored to be illegal fails the retry
  instead of committing. Prior art: the start-fpl-track tests.
- **The captured request shape**, for the breakpoint and the timeout: every request's
  first message ends with the one breakpoint; the configured timeout reaches the
  fetcher's options. Prior art: the ask-for-gameweek-action scripted-fetcher tests.
- **The pure context builder**, for the sentence: present on the empty-Squad branch,
  absent once a Squad exists, readback unaffected. Prior art: the FPL context tests.
- **Configuration reading**, for the knob: default when unset, refusal of a malformed
  value. Prior art: the config tests.

## Out of Scope

- **Any change to the scheduled weekly path** — its skip already implements the policy.
- **Per-seat commit at the opening** — rejected by ADR 0025; all-or-none stands.
- **New columns on `attempts` or a contexts foreign key** — rejected by ADR 0025.
- **JSON mode, structured outputs, or any schema-enforced answer** — ADR 0010's
  prompt-only discipline is the benchmark, not a cost bug.
- **Caching for data fetches, or Match-track wiring of the timeout knob** — declined
  until a measured need exists.
- **Any prompt wording beyond the one opening sentence.**

## Further Notes

**Document numbering must be checked at merge time.** Parallel sessions have renumbered
ADRs before; this spec's number and its two ADRs' must take the next free numbers when
they land, not fight over one.

**The deadline is the season's first FPL Lock** — for the sentence absolutely (ADR
0026's window closes at first use), and for the rest practically: the opening is where
the waste was measured.

**The dry opening is the baseline.** Forty-two calls, three timeouts per run at 120
seconds, and two identical `transfers_in` confusions are the recorded before-picture;
after the first real Gameweek, the after-picture is read from the same attempts table.
