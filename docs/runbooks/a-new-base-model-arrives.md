# A new Base Model arrives

Base Models ship all year; a Season starts once. This is what to do when a vendor
releases something newer than a seat on the roster — which of three doors it goes
through, and why the answer is usually a date rather than a judgement about the model.

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md)
(pinning), [ADR-0014](../adr/0014-the-roster-grows-to-nine-entrants.md) and
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(who is on the roster), [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md)
(the door after the Lock), [ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md)
(what the roster size is load-bearing for).

---

## 1. Decide which door, by date

Three windows, and the release date picks one. This is not a question about how good
the model is.

| When it arrives | Door |
| --- | --- |
| Before the FPL track has started and before the roster cutoff | Joins the Season Roster — sections 2–5 |
| After the FPL track started, or after the cutoff, or after the first Lock | Exhibition Run — section 6 |
| Any time, if the seat it would replace is fine | Nothing. Section 7 |

**The binding edge is the FPL track's start, not the Match track's first Lock.**
`manager_states` is insert-only, so once the track opens, a seat's Season path exists and
cannot be reassigned to a different Base Model. Moving only the Match seat would leave
the two tracks running different Base Models under one Entrant name, which ADR-0034
forbids. Both tracks move together or neither moves.

The cutoff is the second edge, and it exists so nothing enters the Season unobserved: a
candidate that has not passed a pre-flight with time to spare for a second, full-roster
pre-flight before the track starts is late, however new it is.

## 2. Read the catalog before anything else

Three facts decide how the seat is written, and all three come from OpenRouter rather
than from the announcement:

```bash
curl -s https://openrouter.ai/api/v1/models | jq '.data[] | select(.id | startswith("VENDOR/")) | {id, canonical_slug, created}'
```

```bash
curl -s https://openrouter.ai/api/v1/models/VENDOR/MODEL/endpoints | jq '.data.endpoints[] | {provider_name, tag, quantization, status}'
```

- **Is it a successor or a snapshot?** A dated slug beside an unchanged undated one
  (`…-0813` while `…/model` still resolves to an older date) is a snapshot, not a new
  model. The roster pins undated names on purpose, so a snapshot is not a swap — it is
  something a future pre-flight will report as a resolution change. Leave the seat alone.
- **Is it the same tier?** A higher version number in a lower tier is not an upgrade. A
  Frontier seat takes a Frontier successor; check what the vendor's current top model
  actually is before assuming the newest number is it.
- **How many endpoints, and at what quantization?** One endpoint means the provider pin
  already fixes the precision, so `quantization` stays null with the reason written down;
  several endpoints mean pin both. This is also where a `quantization` that changed to
  `unknown` shows up — an obsolete filter matches nothing and the seat answers HTTP 404
  rather than serving.

Classify it by CONTEXT.md's Base Model Class criterion while the endpoint list is in
front of you: sole endpoint served by the vendor itself is First-party; public weights
with third-party hosts is Open-weight.

## 3. Check the candidate before touching a single Entrant row

Never edit the roster to check a model. Insert it as a temporary Exhibition row and aim
the single-model pre-flight at it: the same call path, the same prompt, the same
validation, and no Entrant row is at risk while an unproven model answers for the first
time.

```sql
insert into models (id, name, base_model, provider, quantization, prompt_version, role, config)
values ('candidate/NAME', 'NAME', 'VENDOR/MODEL', 'PROVIDER', null, 'match/2026-27-v2', 'exhibition', '{}');
```

```bash
set -a; . ./.env; set +a; EXHIBITION_MODEL_ID=candidate/NAME FIXTURE_ID=... npm run preflight
```

`EXHIBITION_MODEL_ID` and `EXPECTED_ENTRANT_COUNT` cannot both be set — the pre-flight
checks the roster or one named row, never both. Read three things off the report: that
it is `parseable` (not a refusal — probability forecasting sits near betting and content
policy varies by vendor), the resolved provider, and the resolved dated model. That
resolved dated id is the `canonicalSlug` the seat will carry. The catalog's
`canonical_slug` was the expectation; this is the observation, and the observation is
what gets written down.

Walking away from a candidate at this point is deleting one row.

## 4. Move the roster

Only once the replacement has answered:

1. Delete the outgoing Entrant rows — **one per Competition**, not one: the match track
   seats the roster in every listed Competition under that Competition's own Prompt
   Version (ADR-0038), so `match/NAME` has a `match-pd/NAME` beside it. Delete the
   temporary candidate row too.
2. Edit the roster of record — the seat's id names the Base Model, so a succession is a
   new id, and the `canonicalSlug` and catalog-checked date are the ones section 3
   observed.
3. Enter both tracks. `npm run roster:enter` writes the Match seats for every Competition
   the `competitions` table lists; the FPL seats are entered by hand at the FPL Prompt
   Version, one per Base Model. If step 1 left an outgoing seat behind, this refuses by
   name rather than seating over it — the Season Roster closed at the first Lock and the
   stored seats are the record of what stood there.
4. Run the full-roster pre-flight and write its report into `docs/reports`, in the shape
   of the ones already there.

The intermediate states are loud by design: a full pre-flight expecting N refuses a table
holding N+1 (old rows not yet deleted) and N−1 (new rows not yet entered). Both refusals
are the mechanism working. Do not relax the count to get past them.

## 5. If the roster's size changed, more moved than the roster

A swap is one entry. **An addition or a removal is a different job**, because the size is
load-bearing: the declared roster size, the FPL track's all-or-none start, the pre-flight's
expected count, the rehearsal's scripted seats (guarded to equal the roster size), the
dashboard's loading skeleton, and ADR-0016's arithmetic — pair count, comparisons against
the leader, and the complete-case intersection at the assumed Gap rate. All of that moves
in one change or the guards fire, and the new numbers belong in the ADR that changed the
size. Spec 0015 and its tickets are the worked example.

## 6. After the door closes: the Exhibition Run

A Base Model that missed the roster still enters the record. Insert it with
`role = 'exhibition'`, pre-flight it as in section 3, and replay it over the stored
contexts of every Settled Gameweek. It appears on the readable rankings labelled with
when it ran, and it never joins the complete-case intersection, a Comparison Anchor, or a
published interval — its Base Model may already know the results.

No code changes and no new ADR: ADR-0032 decided this, and the harness takes a `model_id`.

## 7. The option that is usually right

Doing nothing is a real answer. Every swap resets a seat's observation history to zero,
and a seat that has passed several pre-flights with stable resolution is worth more than
a version number. Chase a successor when the seat is genuinely behind its tier — not
because the catalog moved.
