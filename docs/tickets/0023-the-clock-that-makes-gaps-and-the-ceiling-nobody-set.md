# Tickets: The clock that makes Gaps, and the ceiling nobody set

Two slices from one afternoon. On 2026-08-20 the match track's first two Gameweeks under
the restarted Prompt Versions were run by hand, and between them produced 53 Gaps that
were nothing to do with the Base Models: 37 from a two-minute client timeout that five
seats cannot beat, and 16 from an HTTP 402 refusing calls the account had the money for.

They look like one story and are two. The timeout is ours, set to a round number in a
benchmark built to compare Base Models that think for different lengths. The 402 is a
request that never says how much output it will pay for, so the provider prices it against
the model's ceiling instead of its actual size and refuses when the balance cannot cover a
call that would have cost two cents. The provider's own ledger for the day settles both:
$4.7119 billed across 248 generations, subtracting from the balance exactly as every
screenshot along the way showed, with $1.61 still in the account when the refusals landed.

Vocabulary: [CONTEXT.md](../../CONTEXT.md) — **Gap**, **Repair**, **Entrant**, **Base
Model**. The runs behind this are recorded in
[the Gameweek 2 report](../reports/2026-08-20-pd-gameweek-2-first-run-under-v2.md).

Slice 1 is first because it is the one that costs Predictions and its evidence is already
collected. Slice 2 is smaller than it first looked — one field on a request body — and
carries a measured footnote about what the repo's published costs actually are.

---

## 1 — A seat that thinks for two minutes is not a seat that failed

**What to build:** An Entrant that takes longer than the client is willing to wait stops
being recorded as a Gap for it. The call gets a window matched to how long these Base
Models actually take, and a Gap means the seat did not answer rather than that we stopped
listening.

**Blocked by:** None — can start immediately.

- [x] The client timeout is set from measurement, not from the round number it is now.
      `DEFAULT_ENTRANT_CALL_TIMEOUT_MS` is 300,000 — roughly three times the 101.6s mean
      of the slowest seat, chosen off the means because a maximum that clears 120,000ms by
      fifteen milliseconds is a censored distribution and no percentile can be read from
      it. Counted over the two runs this ticket is about, La Liga's Gameweek 2 and the
      Premier League's Gameweek 1: DeepSeek V4 Pro 16 Gaps on a 101.6s mean, Qwen3.8 Max 9
      on 93.1s, Kimi K3 5 on 73.9s, GLM 5.3 4 on 73.4s, Grok 4.6 3 on 59.6s — 37, and five
      seats rather than the four this ticket first said. The five that never Gapped top
      out at 28,785ms, ninety-one seconds below the ceiling with nothing in between.
      `DEFAULT_HTTP_TIMEOUT_MS` stays 120,000 for data fetches, which are not thinking.
- [x] The number is justified where it is set — the constant in
      `src/predictions/openrouter-entrant.ts` carries the per-seat counts and means, names
      the seats that never reach a ceiling, and says why the mean is the only anchor the
      censored record offers.
- [x] Reachable per call on both paths, and stated by every caller rather than defaulted:
      `entrantCallTimeoutMs` is a required option on `predictGameweek`,
      `attemptMatchCalls`, `runScheduledPredictions`, `replayMatchExhibition` and
      `preflightBaseModels`, read from `ENTRANT_CALL_TIMEOUT_MS` by the scheduled, manual,
      preview and pre-flight configurations. An optional one was tried first and left four
      paths — pre-flight above all — silently on the old ceiling.
      **The FPL track keeps its 120,000ms default**: only the Match shape was measured,
      and this ticket excludes changing FPL timeout behaviour beyond reachability.
- [x] `PREDICT_CONCURRENCY` is considered and left at `SEASON_ROSTER_SIZE`, with the
      reasoning recorded at the reader: every timeout Gap came from a ten-wide burst and
      none from pre-flight's one-at-a-time calls, and the wider window is not free wall
      clock — a stuck seat now holds its worker for five minutes, so this is the number to
      lower if a run starts approaching its Lock.
- [x] A test pins that a call abandoned by the client is recorded as a timeout Gap and
      nothing else, and that the window it was given is the one that reached the call —
      `test/predict-gameweek.test.ts` asserts `error_kind: "timeout"` alongside the
      captured `timeoutMs`, so the classification survives the window moving.

**Landed 2026-08-20.** Suites re-run for this slice: `predict-gameweek`,
`preflight-base-models`, `preview-gameweek`, `run-scheduled-predictions`,
`replay-match-exhibition`, `competition-coexistence`, `run-dry-run`, `predict-job-config`,
`fpl-job-config`, `exhibition-job-config`, `preflight-job-config`, `preview-job-config`
and `http` — 44 files, 318 tests. `tsc --noEmit` clean.
The full suite was not run; it exceeds five minutes.

## 2 — A ceiling nobody set, refused against a balance that was never empty

**What to build:** A run stops being refused for money it was never going to spend. The
request names how much output it will pay for, so the provider's pre-flight estimate is
close to the real cost rather than to the model's maximum.

**Blocked by:** None — independent of slice 1.

- [ ] `openRouterRequest` sends no `max_tokens`. The body carries `model`, `messages`,
      `provider` and `stream` and nothing else, so OpenRouter must price the request
      against whatever output ceiling the Base Model allows — tens of thousands of tokens
      for the reasoning seats — and refuse when the balance cannot cover that ceiling.
      The call it refuses would have cost about two cents.
- [ ] **This is what the 402s were, and the ledger says so.** On 2026-08-20 the Premier
      League run took `OpenRouter returned HTTP 402` on 16 calls. The account was not
      empty: the day's activity export bills $0.1571 for pre-flight, $2.9959 for La Liga's
      Gameweek 2 and $1.5589 for this run, and those subtract from $6.32 to $6.16 to
      $3.17 to **$1.61** — matching every balance screenshot taken along the way, with
      $1.61 still there when the refusals happened.
- [ ] The seats it refused are the expensive ones, which is the signature: Gemini 3.1 Pro
      Preview, Kimi K3, GPT-5.6 Sol Pro and Claude Opus 5 took all sixteen, while MiniMax
      M3 and Muse Spark took none. A ceiling-priced estimate scales with the seat's output
      price, so the dearest seats fail first as the balance falls.
- [ ] A cap is chosen from what the responses actually use rather than from a round
      number, and it does not truncate a legitimate answer: the JSON is small but the
      reasoning seats spend heavily before it. The 2026-08-20 export has the completion
      and reasoning token counts per call to choose from.
- [ ] Cost becomes predictable as a consequence, which is the second reason to do it: a
      request with a stated ceiling can be priced before it is sent, and a pre-run check
      can then refuse a Gameweek the balance cannot finish instead of discovering it two
      thirds of the way through.

### The accounting gap, measured and much smaller than it looked

Recorded spend is a floor, because a call that never returns a body leaves no
`usage.cost` to store. Measured against the provider's own ledger for 2026-08-20:

| Run | Calls billed | Ledger | Recorded | Gap |
| --- | ---: | ---: | ---: | ---: |
| Pre-flight | 9 | $0.1571 | $0.1571 | $0.0000 |
| La Liga Gameweek 2 | 158 | $2.9959 | $2.9246 | $0.0713 |
| Premier League Gameweek 1 | 81 | $1.5589 | $1.4590 | $0.0999 |
| | **248** | **$4.7119** | **$4.5407** | **$0.1712** |

**3.6%, and the reason it is not worse is that a cancelled call is barely billed.** The 28
cancelled generations produced 112,833 completion tokens between them and cost $0.1178 in
total — $0.0042 each against $0.0209 for a completed call. Abandoning a call does not buy
its output at full price.

So this is a footnote rather than a slice of its own: worth recording so nobody reads a
published figure as an invoice, and worth revisiting only if the gap grows. Slice 1
shrinks it further by producing fewer abandoned calls.

## Not in these slices

Retrying Gaps that have passed their Lock — a Gap is never back-filled. Changing what
counts as a Repair. The FPL track's own timeout behaviour beyond making the window
reachable per call. Any change to the scheduler's cadence or to `predict.yml`.
