# Base Model pre-flight, the Nations League's seven seats — 2026-09-22

The cup's roster of record walked in and answered before its first Lock: the Season
Roster less the three ADR-0060 excludes, with GPT-6 Astra and Grok 4.7 standing in for
GPT-5.6 Sol Pro and Grok 4.6. Three runs, nine calls, every one `parseable`, and every
resolved model exactly the dated id the constant pins. **Nothing was amended as a result
of this report, which is what a green pre-flight looks like and is not what one was
expected to look like** — two of the seven had been observed by nothing before today.

Decisions: [ADR-0060](../adr/0060-three-seats-sit-out-the-nations-league-before-its-first-lock.md)
as amended 2026-09-22 (who sits, who stands in, and on what ground),
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md) rule 4
(the cup's Edition 1 takes its opening decision's date as its arrival cutoff, which is
what lets a Base Model listed on 2026-09-21 be here at all),
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(a candidate is pre-flighted alone before the roster's, and the roster's report is owed
before the Season's first Lock),
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md)
(provider pinned, fallbacks off, the dated id read back rather than requested).
Steps: [opening a Competition](../runbooks/opening-a-competition.md) §3,
[a new Base Model arrives](../runbooks/a-new-base-model-arrives.md) §3.

## Where it was run, and why not on the record

On a throwaway database, `unl_preflight`, built from the same commands section 3 runs
with one different `DATABASE_URL`. The runbook's reason holds exactly: the pre-flight
reads a real `fixtures` row for the Competition and counts the `models` rows at its
Prompt Version, and both of those exist on production only after the `competitions`
insert — which is the step the pre-flight gates. The prerequisites and the thing they
gate are the same insert, and a second database is the way out.

| Step | Observed |
|---|---|
| Migrations applied to the copy | 45, `0001` … `0045` |
| `competitions` | one row, `UNL` / `2026-27` |
| `roster:enter` wrote | 7 seats at `match-unl/2026-27-v1` |
| `npm run fetch` landed | 156 Fixtures across 6 Gameweeks |
| Gameweek 1 deadline | `2026-09-24T14:30:00Z` |
| Fixture used | 2048009, Andorra v Malta, kick-off `2026-09-24T16:00:00Z` |
| One Fixture's context | 2,332 bytes, ~583 tokens |

The whole Gameweek's packet is 66,791 bytes over its 26 Fixtures; the pre-flight builds
a context for one Fixture, so the number that priced these runs is the 2,332.

Production was read once in this session, and only to apply what it was missing:
`0045_who_picks_each_national_side_and_since_when.sql` was the single pending migration —
`0042`, `0043` and `0044` had landed since ticket 0076 listed four — rehearsed green over
a copy of the record (26,459 rows across ten watched tables, every one back whole) and
then applied. Nothing else on production was written.

## Run A — GPT-6 Astra alone

A temporary `candidate/gpt-6-astra` row at `role = 'exhibition'`, because an unproven
Base Model must never answer for the first time from an Entrant row.

| | Pinned in `MATCH_SUBSTITUTIONS` | Reported by OpenRouter |
|---|---|---|
| Resolved model | `openai/gpt-6-astra-20260903` | `openai/gpt-6-astra-20260903` |
| Resolved provider | `openai` | OpenAI |
| Status | — | `parseable` |

## Run B — Grok 4.7 alone

Listed on OpenRouter 2026-09-21, the day before the decision that seats it. This run is
the whole of what is known about it beyond the catalog.

| | Pinned in `MATCH_SUBSTITUTIONS` | Reported by OpenRouter |
|---|---|---|
| Resolved model | `x-ai/grok-4.7-20260916` | `x-ai/grok-4.7-20260916` |
| Resolved provider | `xai` | xAI |
| Status | — | `parseable` |

## Run C — the seven, one Fixture, seven calls

Both `candidate/…` rows deleted first: a temporary row left standing makes the count
refuse, which is the guard doing its job and not an obstacle to work around.

| Seat | Resolved model | Resolved provider | Status |
|---|---|---|---|
| Claude Opus 5 | `anthropic/claude-opus-5-20260723` | Anthropic | `parseable` |
| Gemini 3.1 Pro Preview | `google/gemini-3.1-pro-preview-20260219` | Google AI Studio | `parseable` |
| GLM 5.3 | `z-ai/glm-5.3-20260816` | Z.AI | `parseable` |
| GPT-6 Astra | `openai/gpt-6-astra-20260903` | OpenAI | `parseable` |
| Grok 4.7 | `x-ai/grok-4.7-20260916` | xAI | `parseable` |
| Kimi K3 | `moonshotai/kimi-k3-20260715` | Moonshot AI | `parseable` |
| Muse Spark 1.2 | `meta/muse-spark-1.2-20260805` | Meta | `parseable` |

Seven of seven resolved to the dated id their `canonicalSlug` names, so no seat's pin
moved and ADR-0060's substitution table stands as written. The five carried seats
resolved to the same dated ids the 2026-08-15 ten-seat report recorded, which is the
check ADR-0009 keeps a stable request name for: a vendor moving the snapshot under a
stable name would have shown up here.

## Two things this report found that the runbook did not say

**`.env` sets `EXPECTED_ENTRANT_COUNT`, so a single-candidate run dies on config.**
`EXHIBITION_MODEL_ID` and `EXPECTED_ENTRANT_COUNT` cannot both be set, and sourcing
`.env` sets the second — so runs A and B refuse before any Base Model is reached unless
the variable is unset in the shell. It costs nothing, because the refusal lands in
`readPreflightJobConfig` and not on the wire, but an operator who reads the refusal as a
failed pre-flight would draw the wrong conclusion. The runbook now carries the `unset`.

**The pre-flight records no `attempts` row.** Zero rows after all three runs. It is a
check and not a run, so there is no stored telemetry to read latency, tokens or cost off
— those are OpenRouter's side only. A reader looking for what these nine calls cost will
not find it in the record, and that is by design rather than an omission. The cost read
off the catalog's rates and the measured output lengths of ADR-0060's table is about
$0.35 for the nine.

## What this report does not establish

- **Nothing about forecasting skill.** `parseable` says a seat answered the production
  prompt in the shape the validator accepts, on one Fixture, once. Two of these seats
  have no record at all on club football and this run does not give them one.
- **Nothing about latency under load.** One call at a time, no Lock, no concurrency. The
  two-minute latencies that ADR-0060's table shows for the excluded seats were measured
  over a Season, not a pre-flight.
- **Nothing about the cup's first Lock holding.** That is the dry run's job, and the dry
  run cannot run until the insert has happened and a fetch has archived the bytes —
  ticket 0076's *Two corrections* is the standing note on why.
