---
status: accepted
---

# Eight seats open the leagues' second Edition

> **Accepted 2026-10-08** by the operator with "เอาให้ทัน lock พรุ่งนี้": open at the 2026-10-09/10 Locks after all, not the 10-16/17 row the table below expected. The grounds in *Leaving, and the ground each leaves on* stand as drafted and were confirmed by the operator the same hour, as was the second Anthropic seat being an addition and not a replacement. What that compresses into one day is listed under *What it takes*; the boundary table keeps its 10-16/17 row as the fallback ADR-0054 provides if anything below is not in place by a league's Lock.

**The five leagues' Edition 2 seats eight: Claude Opus 5, Claude Opus 5.5, Gemini 3.1 Pro
Preview, GPT-6.1 Sol, Grok 4.7, Muse Spark 1.3, Kimi K3 and GLM 5.3.** Six of Edition 1's
ten leave at the boundary — DeepSeek V4 Pro, MiniMax M3, Qwen3.8 Max, GPT-5.6 Sol Pro,
Grok 4.6 and Muse Spark 1.2 — and four join: Grok 4.7 (already seated in the cup), and
three Base Models no Competition has seated, GPT-6.1 Sol, Muse Spark 1.3 and Claude Opus
5.5. This is the roster ADR that ADR-0061 said must exist before any seat is withdrawn,
pre-flighted or entered under the Edition mechanism; nothing below is used until this
note is accepted. The operator named the roster on 2026-10-08, taking the Nations
League's seven (ADR-0060) as the base and making three changes to it.

## The roster, and where each seat comes from

| Seat | `baseModel` | Canonical slug | Listed on OpenRouter | Provider pin | Class | Price in / out per M tokens | Status at the boundary |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Claude Opus 5 | `anthropic/claude-opus-5` | `anthropic/claude-opus-5-20260723` | before cutoff | `anthropic` | Frontier | — | plays on |
| **Claude Opus 5.5** | `anthropic/claude-opus-5.5` | `anthropic/claude-opus-5.5-20260921` | 2026-09-22 | `anthropic` | Frontier | $4 / $20 | **joins** |
| Gemini 3.1 Pro Preview | `google/gemini-3.1-pro-preview` | `google/gemini-3.1-pro-preview-20260219` | before cutoff | `google-ai-studio` | Frontier | — | plays on |
| **GPT-6.1 Sol** | `openai/gpt-6.1-sol` | `openai/gpt-6.1-sol-20260929` | 2026-09-29 | `openai` | Frontier | $2 / $10 | **joins** |
| **Grok 4.7** | `x-ai/grok-4.7` | `x-ai/grok-4.7-20260916` | 2026-09-21 | `xai` | First-party | $1.60 / $4.80 | **joins** the leagues (seated in the cup since ADR-0060) |
| **Muse Spark 1.3** | `meta/muse-spark-1.3` | `meta/muse-spark-1.3-20260902` | 2026-09-02 | `meta` | First-party | $1.25 / $4.25 | **joins** |
| Kimi K3 | `moonshotai/kimi-k3` | `moonshotai/kimi-k3-20260715` | before cutoff | `moonshotai` (mxfp4) | Open-weight | — | plays on |
| GLM 5.3 | `z-ai/glm-5.3` | `z-ai/glm-5.3-20260816` | before cutoff | `z-ai` (fp8) | Open-weight | — | plays on |

Catalog read 2026-10-08. Every joining seat was listed before this note's date, which is
the cutoff ADR-0061 rule 4 sets; every one has a single first-party endpoint at
`unknown` quantization, so the provider pin is the whole of the pin, as it was for the
seats ADR-0034 entered. The `canonicalSlug` column is the catalog's word until a
pre-flight reads the resolved model back; the three unseated Base Models have been
observed by nothing. `openai/gpt-6.1-sol-pro` and `meta/muse-spark-1.3-contributor` also
exist in the catalog; this note seats the plain ids the operator named.

**Leaving, and the ground each leaves on.** The grounds are the ones this note can read;
the operator named the roster without stating them, and is asked to confirm or amend
this section before acceptance.

- **DeepSeek V4 Pro, MiniMax M3, Qwen3.8 Max** — the bottom three of ten on Season-to-date
  points as measured on 2026-09-22 (ADR-0060's table), which is the ground ADR-0060 cut
  them from the cup on. Standing, not cost, not reliability: that note's reasoning is this
  note's for the leagues.
- **GPT-5.6 Sol Pro, Grok 4.6, Muse Spark 1.2** — replaced by their houses' successors
  (GPT-6.1 Sol, Grok 4.7, Muse Spark 1.3). Fourth, fifth and sixth of ten on 2026-09-22;
  nothing measured is the reason. The ground is the one ADR-0060 recorded for its two
  substitutions: a preference for each house's newest Base Model.

**Joining, and why.** Three are the successors just named. The fourth, Claude Opus 5.5,
is the operator's addition: a second Anthropic seat, beside Claude Opus 5 rather than in
place of it. The ground is the same preference, and the difference from the other three
is stated plainly in *What it costs* — this is the first time one house holds two seats
on a roster.

## The decision

- Edition 2 of `PL`, `PD`, `SA`, `BL1` and `FL1` seats the eight above, under each
  league's standing Prompt Version (no bump; ADR-0061). The Nations League keeps its
  Edition 1 seven and is not touched.
- **The roster size is eight, not ten.** ADR-0061 rule 5 says a size other than ten must
  re-derive what depends on it: ADR-0016's N−1 comparisons against the Anchor become
  seven; the complete-case intersection at the measured per-seat Gap rate of 0.98 rises
  from ≈82% to ≈87%; `PREDICT_CONCURRENCY` defaults to the roster size and sizes the
  OpenRouter reservation ADR-0049 warned about. `SEASON_ROSTER_SIZE` stays the Season's
  ten — it describes Edition 1 and the FPL door — and Edition 2's size is derived from
  this roster, never written.
- **Expected boundary.** Not the Gameweeks whose Locks fall on 2026-10-09/10: this note,
  ticket 0086's runbook, four single-seat pre-flights, one eight-seat pre-flight, the
  stamps, `roster:enter` and the Editions rows cannot all land in a day. The first
  Gameweeks after those are the target, and ADR-0054's rule holds — if they are missed,
  Edition 1 plays on and the next row of the table applies.

  | League | Edition 1 would close at | Edition 2 opens at | Lock | fallback |
  | --- | ---: | ---: | --- | --- |
  | BL1 | Gameweek 5 | Gameweek 6 | 2026-10-16T17:00Z | GW 7, 10-23T17:00Z |
  | SA | Gameweek 6 | Gameweek 7 | 2026-10-16T17:15Z | GW 8, 10-23T17:15Z |
  | FL1 | Gameweek 6 | Gameweek 7 | 2026-10-16T17:15Z | GW 8, 10-23T17:15Z |
  | PD | Gameweek 8 | Gameweek 9 | 2026-10-16T17:30Z | GW 10, 10-23T17:30Z |
  | PL | Gameweek 6 | Gameweek 7 | 2026-10-17T10:00Z | GW 8, 10-23T17:30Z |

  The boundary is what the record shows once the seats are entered; this table is the
  expectation and is not set by hand.
- **The FPL track does not move** (ADR-0061 rule 6). The six who leave the leagues keep
  their FPL seats to the end of the Season; the four who join do not join the FPL track
  in 2026-27.
- **The six who leave may enter Edition 2 only as Exhibition Runs** (ADR-0032), which
  support no claim of forecasting skill.

## What it costs, stated rather than discovered later

- **Two seats from one house.** Claude Opus 5 and Claude Opus 5.5 are both Anthropic's.
  CONTEXT.md's Base Model Class says Frontier is "the three houses the founding roster
  counted as frontier"; nothing forbids a house seating two Base Models, and ADR-0055's
  Shadow Seat already pairs two calls of one house's Base Model — but a Shadow Seat is
  ranked nowhere and this seat is. A reader of Edition 2's leaderboard should know that
  of eight ranks, two belong to one vendor, and that any "which house forecasts best"
  reading has to count them as one house with two tries. The class mix becomes four
  Frontier, two First-party, two Open-weight — the open-weight side, which ADR-0047 and
  ADR-0060 both said this benchmark exists to keep in the picture, falls from five of
  ten to two of eight.
- **Six leave on standing or on a preference, none on a measurement of failure.** ADR-0060
  said this of three; this note says it of six, and for the three successors there is
  not even the standing argument. A reader comparing Edition 2 to Edition 1 should know
  the field was cut by Edition 1's table and by the catalog's release notes.
- **Three unobserved Base Models before one Lock.** Grok 4.7 passed the cup's
  pre-flight on 2026-09-22; GPT-6.1 Sol, Muse Spark 1.3 and Claude Opus 5.5 have answered
  this benchmark's prompt never. Three single-seat pre-flights and one full-roster
  pre-flight, every one paid, stand between this note and the first Lock. If any
  refuses, the roster is amended here before the eight-seat run, as ADR-0060 provided.
- **Eight Season-to-date totals start at zero in October** while the cup is at Gameweek 4
  and Edition 1's totals stand frozen beside them under `/edition-1/`.
- **Spend moves.** Claude Opus 5.5 at $20 per million output tokens is the dearest seat
  this benchmark has seated after GPT-6 Astra; at Claude Opus 5's measured 352 output
  tokens it is cheap in practice, but its output length is unmeasured. Ticket 0077's
  method (the real per-Fixture rate off `attempts`) is owed for Edition 2 after its first
  Gameweek settles.

## What it takes

Everything ADR-0061's tickets built is in place (0082–0085, 0096, 0097). What remains is
ticket 0086's runbook and the operator's sequence it describes: this note accepted →
three single-seat pre-flights on a throwaway database → the eight-seat pre-flight →
`withdrawn_at` stamped on the six at each league's Edition 2 first Lock → `roster:enter`
for the four under each league's Prompt Version → the five Editions rows inserted → a
dashboard deploy carrying the closed-Edition constant (ticket 0085's deviation). The
pre-flights spend money and are asked for one at a time.

## Considered options

- **Keep ten by not dropping the bottom three.** Rejected by the operator; the cup's
  reasoning (ADR-0060) carries over.
- **Replace Claude Opus 5 with 5.5 rather than adding it**, keeping one seat per house as
  every roster so far has. Not what the operator asked for; recorded because it is the
  option that keeps the class mix readable and is the one to return to if the two-seat
  house proves a confound.
- **Seat the cup's exact seven** (GPT-6 Astra and Muse Spark 1.2 rather than GPT-6.1 Sol
  and Muse Spark 1.3). Rejected: both houses shipped again between 2026-09-22 and this
  note, and the operator's preference is the newest.
- **Open at the 2026-10-09/10 Locks.** Impossible on the calendar; see the boundary table.

## Consequences

- ADR-0061's *What this ADR does not decide* is answered; ticket 0086 is unblocked.
- The cup's roster and the leagues' Edition 2 roster differ by one seat (Claude Opus 5.5)
  and two successors; `/overall` already sums the leagues alone (ADR-0051 as amended).
- A per-Edition roster size is a new fact the dashboard's skeleton and the pre-flight's
  `EXPECTED_ENTRANT_COUNT` read from the roster of record, not from `SEASON_ROSTER_SIZE`.
- The next Edition, if any, decides its own roster in its own ADR.
