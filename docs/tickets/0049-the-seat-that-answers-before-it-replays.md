# Ticket: The seat that has to answer before it is allowed to replay

**What to build:** `stealth/ox-alpha` becomes one `models` row with `role = 'exhibition'` at
the Premier League's frozen Prompt Version, is put through the single-model pre-flight
against a real Fixture, and the run's report is read for three things and one measurement:
that it is `parseable`, that OpenRouter resolved a provider and a model, and how much of
the 32,000-token output ceiling a reasoning Base Model leaves for the answer. The ticket
ends in a go or a no-go backed by a stored attempt, not by an opinion about the model.
Source:
[docs/runbooks/a-new-base-model-arrives.md](../runbooks/a-new-base-model-arrives.md)
sections 2, 3 and 6. Decision:
[ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md).

**Blocked by:** None — can start immediately.

**Status:** done

---

## What is already known

No code changes. ADR-0032 decided the Exhibition Run, the harness takes a `model_id`, and
the door in is data: the row is inserted by the operator and the pre-flight already targets
one Exhibition by id.

**The catalog, read 2026-08-23.** `GET /api/v1/models/stealth/ox-alpha/endpoints`:

| Field | Value | What it decides |
| --- | --- | --- |
| `id` | `stealth/ox-alpha` | `base_model` |
| `canonical_slug` | `stealth/ox-alpha` — **undated** | `config.canonical_slug` |
| endpoints | exactly one, `tag: "stealth"` | `provider = 'stealth'` |
| `quantization` | `unknown` | `quantization` stays null |
| `pricing` | `0` / `0` | the replay spends nothing |
| `max_completion_tokens` | 131072 | far above our ceiling; the ceiling is ours, not theirs |
| `created` | 2026-08-20T20:04Z | after ADR-0034's 2026-08-19 cutoff — Exhibition is the door |

**`quantization` stays null, and that is not a weakening of
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md).**
The reasoning is `match/qwen3.8-max`'s, unchanged: one endpoint means the provider pin
already fixes the precision the quantization pin exists to fix, and a filter naming a
precision the catalog calls `unknown` matches nothing and answers HTTP 404 instead of
serving.

**Base Model Class is `First-party`** by CONTEXT.md's criterion — a vendor serving its own
Base Model as the sole endpoint. It is not Frontier, which names the three houses of the
founding roster, and not Open-weight, which needs public weights and third-party hosts.
What is unusual is that the vendor is anonymous during the preview, and that changes the
classification not at all; it belongs in the row's reason, not in a fourth class.

**The undated slug is why this is an Exhibition and not a candidate for a seat.** ADR-0009
pins undated names so that a vendor moving the snapshot underneath one is detectable at the
next pre-flight. `stealth/ox-alpha` has no dated id to resolve to, so that detection has
nothing to compare against. An Exhibition Run's figures already support no claim; a seat's
would.

**Two ways this pre-flight can fail that are not the model refusing.**

- Reasoning tokens count against `max_tokens`, and `ENTRANT_MAX_OUTPUT_TOKENS` is 32,000.
  A run that is cut off is recorded against `TRUNCATED_AT_CEILING` rather than as a bad
  answer, which is the taxonomy working — but if it happens here it happens on every
  Fixture of the replay, and the ticket after this one is not worth starting.
- The report is `ok` only when the response's `openrouter_metadata` names a selected
  endpoint carrying both a provider and a model. A stealth endpoint that reports one and
  not the other gives `ok: false` over a perfectly parseable forecast. Read the report,
  not the exit code.

**Prompts are retained by an anonymous third party** and, per the model page, not used for
training. The contexts carry public football data, so this is a note for the record rather
than a blocker.

## Acceptance

- [x] One `models` row exists for the Premier League: id `exhibition/ox-alpha`, name
      `Ox Alpha`, base model `stealth/ox-alpha`, provider `stealth`, quantization null,
      Prompt Version `match/2026-27-v2`, role `exhibition`, and a `config` carrying
      `baseModelClass`, `canonical_slug` and the catalog date this ticket checked
- [x] Every scheduled job and every dashboard read returns exactly what it returned before
      the row existed — the predict work query, the pre-flight roster count, the FPL
      opening check, the FPL run's roster, the Gap alert, the per-Competition leaderboard
      and the combined ranking — proven behaviourally rather than by reading the filters
      (combined ranking exclusion proven in `test/dashboard-overall-view.test.ts:178`;
      the other six readers in `test/exhibition-candidate-coexistence.test.ts`)
- [x] The single-model pre-flight aimed at the row answers over a real Premier League
      Fixture and its report is stored in `docs/reports` in the shape of the ones already
      there, naming the resolved provider, the resolved model and the status
- [x] The report records the completion tokens the answer used against the 32,000 ceiling,
      so the next ticket's risk is a number and not a guess
- [x] A `finish_reason: length` or a refusal ends the work here, and what is written down
      is which of the two it was
- [x] Deleting the row is the whole of walking away — nothing else has to be undone
      (operational models and dashboard state are completely restored while preserving
      audit snapshot evidence in `raw_snapshots`, proven in
      `test/exhibition-candidate-coexistence.test.ts`)
