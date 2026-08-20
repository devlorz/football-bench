# Tickets: The clock that makes Gaps, and the bill that hides them

Two slices from one afternoon. On 2026-08-20 the match track's first two Gameweeks under
the restarted Prompt Versions were run by hand, and between them produced 61 Gaps — 37 of
them from a two-minute client timeout that four seats cannot beat, and 16 more from an
HTTP 402 that arrived because the money ran out earlier than the record said it should.

The two are one story told from both ends. A call that times out is abandoned by us and
finished by the provider, who bills for it; because no response comes back there is no
`usage.cost` to store, so the spend is real and the record of it is not. Every cost figure
this repo has published is therefore a floor, and the gap between the floor and the bill
is exactly the calls that are also producing the Gaps.

Vocabulary: [CONTEXT.md](../../CONTEXT.md) — **Gap**, **Repair**, **Entrant**, **Base
Model**. The runs behind this are recorded in
[the Gameweek 2 report](../reports/2026-08-20-pd-gameweek-2-first-run-under-v2.md).

Slice 1 is first because it is the one that costs Predictions, and because the evidence
for it is already collected. Slice 2 is larger and touches money rather than a constant,
so it wants its own review.

---

## 1 — A seat that thinks for two minutes is not a seat that failed

**What to build:** An Entrant that takes longer than the client is willing to wait stops
being recorded as a Gap for it. The call gets a window matched to how long these Base
Models actually take, and a Gap means the seat did not answer rather than that we stopped
listening.

**Blocked by:** None — can start immediately.

- [ ] The client timeout is set from measurement, not from the round number it is now.
      `DEFAULT_HTTP_TIMEOUT_MS` is 120,000, and the four seats that Gap on it have mean
      latencies of 68 to 85 seconds with a **maximum of exactly 120 seconds** — the
      signature of a ceiling being hit rather than a distribution ending. Over the two
      runs: DeepSeek V4 Pro 17 timeouts at 85.2s mean, Qwen3.8 Max 9 at 75.9s, Kimi K3 6
      at 68.3s. Claude Opus 5 means 6.2s and Gemini 16.0s, and neither has ever timed out.
- [ ] The number is justified where it is set, against the latency the record holds. A
      timeout is a claim about how long thinking may take, and this benchmark exists to
      compare Base Models that think for different lengths.
- [ ] Whatever the new window is, it is reachable per call rather than only global: the
      match path and the FPL path have different shapes, and spec 0010 puts the FPL
      context far above the match one.
- [ ] `PREDICT_CONCURRENCY` is considered in the same change. It defaults to
      `SEASON_ROSTER_SIZE`, so ten calls are in flight at once; the four slow seats are
      slowest when the burst is widest, and the provider holds credit against every call
      it has not yet answered.
- [ ] A test pins that a call abandoned by the client is recorded as a timeout Gap and
      not as anything else — the classification is right today and must survive the
      window moving.

## 2 — A call we abandoned is a call we paid for

**What to build:** The repo's cost figures stop being a floor. Spend is counted from what
the provider billed rather than only from the responses that came back, so the number in
a report and the number on the invoice are the same number.

**Blocked by:** None — independent of slice 1, though slice 1 shrinks the problem.

- [ ] The accounting gap is written down before it is closed, because it changes how
      every figure already published should be read: `usage.cost` is stored from the
      response body, a timed-out call has no response body, and the provider bills for it
      regardless — it finished the work, we stopped listening. Two runs on 2026-08-20
      reported $2.9246 and $1.4590 from stored `usage.cost` while 37 further calls were
      abandoned mid-flight and are in neither figure.
- [ ] The size of the gap is measured rather than assumed, by reading the provider's own
      ledger for the window of a known run and setting it beside the stored sum. The
      abandoned calls are not cheap ones: the seats that time out are the seats that
      think longest, which is to say the ones generating the most output.
- [ ] Spend is recorded for calls that produced no usable response, by whatever route the
      provider offers — a generation lookup after the fact, an activity export, or a
      reconciliation pass. An attempt row that cost money says so.
- [ ] The 402 is explained where an operator will meet it. On 2026-08-20 a run began with
      $3.17 showing and $1.46 of recorded spend ahead of it, and still took
      `OpenRouter returned HTTP 402` on 16 calls — because the unrecorded spend was real
      and because ten concurrent calls hold credit the balance has not yet lost. A
      pre-run check that reads the recorded average will keep saying yes to runs that
      cannot finish.
- [ ] The reports that carry the old figures are annotated rather than rewritten: the
      numbers were honestly derived and are floors, and a reader should be told which
      kind of number they are looking at.

## Not in these slices

Retrying Gaps that have passed their Lock — a Gap is never back-filled. Changing what
counts as a Repair. The FPL track's own timeout behaviour beyond making the window
reachable per call. Any change to the scheduler's cadence or to `predict.yml`.
