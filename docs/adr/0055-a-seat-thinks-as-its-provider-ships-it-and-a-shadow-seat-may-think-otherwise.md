# A seat thinks as its provider ships it, and a Shadow Seat may think otherwise

Every match-track request names a Base Model, a pinned provider, a quantization and an
output ceiling, and says nothing about reasoning. What each seat does with that silence
is whatever its provider does by default through OpenRouter: Claude Opus 5 writes its
answer directly, DeepSeek V4 Pro thinks for 8,466 tokens a call before writing 340, and
the eight seats between them sit at every point of that range. Read 2026-09-03 off
`attempts.raw_response` across the whole 2026-27 match record — 1,344 billed calls,
$31.75 — **$19.09 of it, sixty percent, is reasoning tokens**, and the share is higher
than that, because one seat's provider reports its thinking in `message.reasoning` but
not in `reasoning_tokens`. Per seat: Kimi K3 $4.62 of $5.83, Gemini 3.1 Pro $3.63 of
$5.00, DeepSeek V4 Pro $3.36 of $3.79, GLM 5.3 $2.49 of $2.96, Claude Opus 5 $0.00 of
$2.94. The seat that never thinks stands second and third on season-to-date accuracy
and RPS; the seat that thinks longest stands fourth and eighth.

None of this was decided. ADR-0001 holds that the only thing permitted to vary between
Entrants is the Base Model; ADR-0009 pins provider and quantization so that "the host"
is not what gets measured. Reasoning effort is a request parameter OpenRouter accepts
for all ten seats (`reasoning: { effort | max_tokens | enabled }`), sits beside
`max_tokens` in the same envelope, and has never been set — so ten different defaults
have been competing on one leaderboard for three Gameweeks under a rule that names
neither them nor their absence.

## The decision, in two parts

**A seat is its Base Model as its provider ships it.** The request keeps sending no
`reasoning` field, and the provider's default becomes a stated property of the seat
rather than an accident of one: a Base Model's habit of thinking before it answers, and
how long, is part of what the benchmark compares, in exactly the way its habit of
answering in the shape asked for is (ADR-0010's Repairs measure the second; the bill
measures the first). This is what has been true since the first Lock; the record it
produced stays comparable with itself, and no Season restart is spent on it.

**A Shadow Seat may ask the same Fixture with a different envelope, and is never
ranked.** A `models` row with `role = 'shadow'` names an existing seat's Base Model,
provider and quantization, the same Prompt Version, and in `models.config` — a column
migration 0001 created and nothing has read since — the one thing that differs on the
wire, `{"reasoning": {"effort": "none"}}` and nothing else. It is called by the same
prediction run at the same Lock over the same stored context bytes as the seat it
shadows, so its Predictions pre-date the deadline like every real one and the two rows
are a paired comparison on identical Fixtures. It is excluded from the Season Roster,
from scoring, from the gap alert, from the pre-flight count and from every dashboard
surface by the filter every one of those already applies, `role = 'entrant'`; only the
prediction run widens its selection to admit it. What it is for is one question the
record cannot answer on its own: whether a seat's reasoning buys it anything. Split
within any seat by how long a call thought, the half that thought longer forecasts
worse — DeepSeek 0.673 against 0.481 on outcome hit rate, Kimi 0.673 against 0.510 — but
so does Claude Opus 5, 0.588 against 0.510, with zero reasoning on both halves; a seat
thinks longer about the Fixtures that are harder, and that confound cannot be read out
of a record where every call chose its own effort.

## Why not the alternatives

- **Set `reasoning` on the real seats now** — `effort: "none"` everywhere would return
  about sixty percent of the projected $506.90 Season (ADR-0054). Rejected for this
  Season: it changes the question mid-Season, which ADR-0042 treated as a restart of
  every league's record, and it would be done without knowing what it costs in
  forecasts, which is the thing the Shadow Seat exists to find out. It is the decision
  the 2027-28 Prompt Versions may take on evidence.
- **Cap reasoning with `max_tokens` on the real seats** — the same objection, smaller,
  plus OpenAI and xAI accept `effort` only, so one cap is two mechanisms, and a budget
  that ends before the answer begins is the empty `content` the FPL track has already
  recorded (`openrouter-entrant.ts`, `ENTRANT_MAX_OUTPUT_TOKENS`).
- **Run the comparison as an Exhibition Run (ADR-0032)** — rejected: an Exhibition runs
  after the Fixtures are played, and that ADR forbids reading its numbers as skill. A
  pair whose two halves were asked on different sides of the result is not a pair.
- **Reuse `role = 'exhibition'` or `'reference'` for the shadow** — rejected; both carry
  meanings (post-hoc replay; the scorer's own Reference Line) that a pre-Lock experiment
  is not, and the dashboard shows exhibitions by name.
- **Make the Gemini seat stop failing its first attempt** — considered here because it is
  the largest non-reasoning waste on the record (nine schema failures in nine on Ligue 1
  Gameweek 3, about $0.20 a Gameweek a league) and rejected: ticket 0062 found the
  failure is one reader's positional misreading of a prompt nine others read correctly,
  which is the seat's own result under ADR-0010, and any envelope that fixes it for one
  seat is the coaching ADR-0018 rules out. That money is what measuring
  `attempts_to_valid` costs.

## Consequences

- `models.role` admits `'shadow'`; the prediction run selects `role in ('entrant',
  'shadow')` and nothing else changes its filter. A Shadow Seat's attempts, Predictions
  and contexts land in the same tables under its own `model_id`, and ADR-0007's ledger
  prices it like any seat.
- `openRouterRequest` reads `models.config` into the request body. For every existing
  row `config` is `{}` and the body is byte-for-byte what it is today. The frozen
  Prompt Version — template plus context builder, hashed over the rendered text — is
  untouched: the envelope was never inside it, which is how `max_tokens` doubled on
  2026-08-21 without a version moving.
- A Shadow Seat costs what a seat costs minus its reasoning; on the seats worth
  shadowing that is a few cents a Fixture. Its run is a paid run and is authorised like
  one.
- Comparing a seat to its shadow is a report over `predictions` joined to `fixtures`,
  paired on `fixture_id`, not a leaderboard: the scorer does not see the shadow and is
  not taught to.
- The uniform cache breakpoint (`withCacheBreakpoint`) stays uniform. Claude Opus 5
  pays for cache writes it never reads back — 311,901 tokens written, 13,044 read,
  about $0.39 so far — because it has never needed a Repair; that is a `config` key
  this mechanism could carry later and this ADR does not add.
- Ticket 0066 builds the role, the config read and the first three Shadow Seats.
