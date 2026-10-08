# Base Model pre-flight, the leagues' Edition 2 — 2026-10-08

ADR-0062's eight walked in and answered the production prompt before Edition 2's first
Lock: three Base Models no Competition had seated — Claude Opus 5.5, GPT-6.1 Sol, Muse
Spark 1.3 — each alone as a temporary `exhibition` row, then the eight together. Four
runs, eleven calls, every result `parseable`, and every resolved model exactly the dated
id `MATCH_EDITION_ROSTERS` pins. **Nothing was amended as a result**, and the three
unseated Base Models now have one observation each, which is one more than ADR-0062
could claim for them this morning.

Decisions: [ADR-0062](../adr/0062-eight-seats-open-the-leagues-second-edition.md) (who sits
and why), [ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md)
rule 4 (listed before the ADR; pre-flighted alone and then as the roster, before the first
Lock), [ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md),
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md).
Steps: [opening an Edition](../runbooks/opening-an-edition.md) §2.

## Where it was run

On a throwaway database, `edition2_preflight`, built the way the runbook says and the way
production will be written tonight: the five leagues listed, Edition 1's ten entered per
league, the schedule fetched (no Base Model reached), the six leaving seats stamped at
each league's Edition 2 first Lock **by slug, read off `gameweeks`**, then
`EDITION=2 roster:enter`.

| Step | Observed |
|---|---|
| Migrations applied to the copy | 49, `0001` … `0049` |
| `roster:enter` (Edition 1) | 50 seats, ten per league |
| `npm run fetch` | PL 380, PD 380, SA 380, BL1 306, FL1 306 Fixtures |
| Stamps | 30 — six per league, `withdrawn_at` = that league's first Lock |
| `EDITION=2 roster:enter` | "Entered 40 Entrants for Edition 2 … Left as they stand: UNL" |
| Standing per league at the Lock | 8 of 14 rows, by `isAskedAtLock` at PL GW6's Lock |
| Fixture used | 51, Arsenal v Leeds, PL Gameweek 6, kick-off 2026-10-10T11:30Z |

One thing the dry run of this sequence caught and the runbook now says: a stamp
matched by id prefix misses La Liga, whose seats are `match-pd/2026-27-v2/<slug>` after
ADR-0042's restart. The first `EDITION=2` attempt was refused by name on
`match-pd/deepseek-v4-pro` still standing — ticket 0083's guard doing exactly what it is
for — and the SQL matches by slug suffix from here.

## Runs A, B, C — each candidate alone

| Candidate | Pinned `canonicalSlug` | Reported | Provider | Status |
|---|---|---|---|---|
| Claude Opus 5.5 | `anthropic/claude-opus-5.5-20260921` | `anthropic/claude-opus-5.5-20260921` | Anthropic | `parseable` |
| GPT-6.1 Sol | `openai/gpt-6.1-sol-20260929` | `openai/gpt-6.1-sol-20260929` | OpenAI | `parseable` |
| Muse Spark 1.3 | `meta/muse-spark-1.3-20260902` | `meta/muse-spark-1.3-20260902` | Meta | `parseable` |

`.env` sets `EXPECTED_ENTRANT_COUNT`; it was unset for these three, as the runbook says.

## Run D — the eight, one Fixture, eight calls

The three `candidate/…` rows deleted first, as the count requires.

| Seat | Resolved model | Resolved provider | Status |
|---|---|---|---|
| Claude Opus 5 | `anthropic/claude-opus-5-20260723` | Anthropic | `parseable` |
| Claude Opus 5.5 | `anthropic/claude-opus-5.5-20260921` | Anthropic | `parseable` |
| Gemini 3.1 Pro Preview | `google/gemini-3.1-pro-preview-20260219` | Google AI Studio | `parseable` |
| GLM 5.3 | `z-ai/glm-5.3-20260816` | Z.AI | `parseable` |
| GPT-6.1 Sol | `openai/gpt-6.1-sol-20260929` | OpenAI | `parseable` |
| Grok 4.7 | `x-ai/grok-4.7-20260916` | xAI | `parseable` |
| Kimi K3 | `moonshotai/kimi-k3-20260715` | Moonshot AI | `parseable` |
| Muse Spark 1.3 | `meta/muse-spark-1.3-20260902` | Meta | `parseable` |

Eight of eight resolved to the dated id their `canonicalSlug` names. The four carried
seats resolved to the same dated ids the 2026-08-15 and 2026-09-22 reports recorded, and
Grok 4.7 to the id the cup's pre-flight read back on 2026-09-22 — one identity in the
constant, now observed from two Competitions.

## What this report does not establish

- **Nothing about forecasting skill.** `parseable` says a seat answered the production
  prompt in the shape the validator accepts, once, on one Fixture. Three of these seats
  have never been scored anywhere.
- **Nothing about cost.** The pre-flight writes no `attempts` row; Claude Opus 5.5's
  output length, which decides whether its $20 per million is cheap in practice, is
  unmeasured until Edition 2's first Gameweek settles (ticket 0077's method).
- **Nothing about production's rows.** The stamps, the entry and the Editions rows are
  the operator's, tonight, in the runbook's §4 order, before BL1's Lock − 6h
  (2026-10-09T11:00Z).
