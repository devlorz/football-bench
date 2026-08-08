# Tickets: The cost of asking an Entrant

Four tracer-bullet slices that stop the FPL track paying for its own plumbing: replay on
retry, a timeout knob, a uniform cache breakpoint, and the opening sentence. Source:
[spec 0010](../specs/0010-the-cost-of-asking-an-entrant.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0026](../adr/), especially
[ADR 0025](../adr/0025-the-opening-retry-replays-the-recorded-legal-action.md) and
[ADR 0026](../adr/0026-a-prompt-version-no-context-has-used-may-still-be-amended.md).

Work the **frontier**: all four slices are independent and can run in parallel.
Everything lands before the season's first FPL Lock — the sentence absolutely (ADR
0026's window closes at first use), the rest because the opening is where the waste was
measured.

---

## The opening retry replays the record

**What to build:** Re-running `fpl:start` after a failed opening calls only the seats
without a recorded legal attempt for the Gameweek; every other seat's accepted action is
parsed out of `attempts.raw_response` at the point of use and driven through the full
rules reducer as if freshly answered. The opening stays all-or-none.

**Blocked by:** None — can start immediately.

- [x] A retry after a one-seat failure calls that seat only — asserted from the calls a
      scripted fetcher receives
- [x] Replayed seats commit Manager States identical to the ones fresh answers produce
- [x] A recorded action that no longer passes the reducer fails the retry loudly;
      nothing stale is committed
- [x] No migration and no new column: the record read is `attempts.raw_response` as it
      already stands
- [x] The scheduled weekly path is untouched, its Manager-State skip asserted unchanged
- [x] Proven at the `startFplTrack` seam through scripted HTTP and a real Postgres

## The timeout knob

**What to build:** The Entrant call's timeout reads `ENTRANT_CALL_TIMEOUT_MS` from the
FPL job configurations, defaulting to the current 120 seconds when unset. Only the
Entrant call honours it — data fetches keep the fetcher's default unconditionally.

**Blocked by:** None — can start immediately.

- [ ] The configured value reaches the Entrant call's fetch options — asserted from the
      captured request options at the scripted-fetcher seam
- [ ] Unset means 120 seconds; no other caller of the shared fetcher changes behaviour
- [ ] A malformed value is refused when the job configuration is read
- [ ] Both FPL job configurations (`fpl:start`, `fpl:scheduled`) carry the knob

## The uniform cache breakpoint

**What to build:** Every seat's request has its first message end with one identical
`cache_control` breakpoint, so the two providers that require explicit breakpoints join
the seven that discount automatically — with no seat's envelope differing from another's
and no change to the stored context text or its hash.

**Blocked by:** None — can start immediately.

- [ ] Every request's first message carries exactly one trailing breakpoint, identical
      across seats — asserted from captured requests
- [ ] Repair turns leave the first message byte-identical, breakpoint included
- [ ] The stored context body and hash are unchanged by the breakpoint
- [ ] The real discount is read from recorded attempts after the first Gameweek, per
      spec 0003's standing rule — the spec records the expectation, not an estimate

## The opening sentence

**What to build:** The builder's empty-Squad line becomes "Squad: none yet — this is
your opening Squad. Buy all fifteen players through transfers_in; transfers_out stays
empty." — inside `fpl/2026-27-v2` before the season's first Lock, under ADR 0026's
first-use rule.

**Blocked by:** None — can start immediately.

- [x] The sentence renders on the empty-Squad branch and nowhere else — a Gameweek with
      a Squad shows the ordinary line
- [x] Every existing test asserting the old opening line is updated alongside
- [x] The transfer-pricing readback is unaffected
- [x] The Prompt Version constant still reads `fpl/2026-27-v2`; if the first Lock has
      arrived, this ships as a v3 instead — checked at merge time
