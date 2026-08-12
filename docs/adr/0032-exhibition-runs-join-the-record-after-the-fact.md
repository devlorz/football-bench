# Exhibition Runs join the record after the fact

A Base Model released after the Season began may be run retrospectively as an **Exhibition
Run**: a `models` row with `role = 'exhibition'`, called through the exact production path —
OpenRouter with pinned provider and quantization, the Season's frozen Prompt Version, the
same validation and three-Repair policy — over the stored contexts of every Gameweek already
Settled. Its Predictions, Manager States, attempts and (per-Entrant FPL) contexts are written
to the same tables as real Entrants', under its own `model_id`.

This is the benchmark doing, deliberately and labelled, the thing its founding document says
proves nothing: spec 0001 rules out back-filled Predictions because a Base Model already
knows how past matches ended. That objection is not answered here — it is accepted. An
Exhibition Run's numbers can never distinguish forecasting skill from training-data recall,
and nothing downstream may treat them as if they could.

The record is kept honest by the same mechanism that proves real Predictions pre-date their
Lock, read in reverse: `predicted_at` and `attempts.attempted_at` post-date the deadlines
they cover, and that stored fact — not a separate flag — is what derives the "ran after
Gameweek N" label wherever Exhibition results are shown.

## The two tracks replay differently

- **Match track**: context bodies are shared per Fixture and stored verbatim, so an
  Exhibition Prediction references the existing `contexts` row — the Exhibition model reads
  the same bytes the real Entrants read.
- **FPL track**: contexts are per-Entrant because they carry Manager State. An Exhibition
  Run replays sequentially from the track's opening Gameweek, carrying its own Manager
  State, and builds each Gameweek's body by **splicing**: the donor body of the real Entrant
  with the lowest id for that Gameweek (its shared sections were frozen before that
  deadline), with only the `Your Manager State` block replaced and the "Chips you can play
  this Gameweek" line recomputed via `chipRefusal`. The pool block is never touched, so
  purchase prices are read from the text on record exactly as `parseFplTrackContextPool`
  does for real Entrants; Selling Prices come from the Exhibition Run's own carried state.
  Rebuilding shared sections from `raw_snapshots` was rejected: the stored donor bodies are
  the ground truth, and the snapshot timeline is content-hash keyed and therefore lossy for
  values that oscillate.

## Consequences

- One migration widens the `models.role` check to admit `'exhibition'`. Every existing read
  path already filters `role = 'entrant'` (predict, fill, gap alert, FPL start/run,
  preflight, the scorer, the dashboard's read API), so Exhibition rows are invisible to
  every scheduled job and every surface with no further code — and every **future** reader
  of `models` inherits the obligation to filter by role.
- The scorer and the dashboard's read API (specs 0002 and 0011, both landed) select
  `role = 'entrant'` today and therefore ignore Exhibition rows until extended. The
  extension carries two requirements: score Exhibition rows with the same metrics, and
  exclude them from Comparison Anchor selection, the complete-case intersection, and the
  eight published intervals. Exhibition Runs appear ranked, with their label, on the
  readable Match Points and Bet Points tables only.
- An Exhibition Gap is recorded like any other but alerts nobody; the Gap alert's roster
  filter already excludes it.
- The Exhibition harness takes only a `model_id`; the row itself — base model, provider,
  quantization — is inserted by the operator first, so joining as an Exhibition passes
  through the same door (and the same pre-flight refusal check) as joining the roster.
- The FPL splice depends on the rendered structure of the frozen Prompt Version (heading-
  delimited Manager State block, blank-line terminators). A future Prompt Version that
  changes that structure must revisit the splice.
- Until the scorer and read-API extension lands, an Exhibition Run stores Predictions and
  Manager States but holds no `scores` rows and appears on no surface — recorded, invisible,
  and waiting, which is the safe failure mode.
