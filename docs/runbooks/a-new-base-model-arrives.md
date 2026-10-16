# A new Base Model arrives

Base Models ship all year; a Season starts once. This is what to do when a vendor
releases something newer than a seat on the roster — which of five doors it goes
through, and why the answer is usually a date rather than a judgement about the model.

Vocabulary: [CONTEXT.md](../../CONTEXT.md). Decisions:
[ADR-0009](../adr/0009-six-entrants-frontier-and-open-weight-all-through-openrouter.md)
(pinning), [ADR-0014](../adr/0014-the-roster-grows-to-nine-entrants.md) and
[ADR-0034](../adr/0034-the-roster-refreshes-to-ten-entrants-before-the-first-lock.md)
(who is on the roster), [ADR-0032](../adr/0032-exhibition-runs-join-the-record-after-the-fact.md)
(the door after the Lock), [ADR-0016](../adr/0016-each-snapshot-publishes-against-one-comparison-anchor.md)
(what the roster size is load-bearing for), [ADR-0047](../adr/0047-three-seats-leave-the-fpl-track-before-its-first-lock.md)
(the tracks may seat different Base Models),
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md) and
[ADR-0062](../adr/0062-eight-seats-open-the-leagues-second-edition.md) (the next Edition's door),
[ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md) (the Guest door)
and [ADR-0065](../adr/0065-gemini-4-argon-is-the-first-guest-seat.md) (the first Guest).

---

## 1. Decide which door, by date

Three windows and five doors. The release date picks the window. After the first Lock, the
question you want answered picks the door. Neither is a judgement about how good the model is.

| When it arrives | Door |
| --- | --- |
| Before the FPL track has started and before the roster cutoff | Joins the Season Roster — sections 2–5 |
| After the FPL track started, or after the cutoff, or after the first Lock, and the question is whether it can forecast | Guest Seat — section 9, while fewer than two Guests stand |
| The same window, and the question is only where it would have stood | Exhibition Run — section 6 |
| The same window, and a roster ADR is due | Wait for an Edition — section 8. A seat only if that ADR names it and it was released before the ADR's date |
| Any time, if the seat it would replace is fine | Nothing. Section 7 |

The late doors combine. Gemini 4 Argon went through section 6 first, then section 9 (ADR-0065),
and its Guest record is the evidence a section 8 ADR can cite.

**The binding edge is the FPL track's start, not the Match track's first Lock.**
`manager_states` is insert-only, so once the track opens, a seat's Season path exists and
cannot be reassigned to a different Base Model. What ADR-0034 forbids is one Entrant name
covering two Base Models: a Match seat moved under the name its FPL seat still answers
to. It does not forbid the two tracks seating different Base Models under different names
— ADR-0047 already seats them so, and an Edition boundary moves the Match track alone
(ADR-0061 rule 6). A swap inside sections 2–5 moves one name on both tracks or on
neither.

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

**It stops where a Guest begins.** Once the same Base Model has a Guest Seat in a
Competition (section 9), the replay of its Exhibition row there covers only the Gameweeks
before the Guest's first Lock (ADR-0064). The replay reads that cap off the Guest row, so
there is no range to type, and it says so: "… before Gameweek N, where its Guest begins".

No code changes and no new ADR: ADR-0032 decided this, and the harness takes a `model_id`.

## 7. The option that is usually right

Doing nothing is a real answer. Every swap resets a seat's observation history to zero,
and a seat that has passed several pre-flights with stable resolution is worth more than
a version number. Chase a successor when the seat is genuinely behind its tier — not
because the catalog moved.

## 8. The fourth door: wait for an Edition

A Base Model released after the first Lock can hold a seat only from the next Edition
boundary (ADR-0061), and only if that Edition's roster ADR names it and it was released
before that ADR's date (rule 4). Whether to name it is the ADR's question, not this
page's; until the ADR is accepted, its door is section 6 or section 9 and nothing in sections 3–4 is
done for it. After acceptance, follow [Opening an Edition](opening-an-edition.md) in
order. ADR-0062 is the worked example: Claude Opus 5.5, GPT-6.1 Sol, Muse Spark 1.3 and
Grok 4.7, all released after Edition 1's cutoff, joined the leagues at their Edition 2.

## 9. The fifth door: a Guest Seat

A Guest Seat answers at the Lock beside the roster, so its record shows whether a Base
Model forecasts, which an Exhibition Run cannot (ADR-0064). ADR-0065 is the worked example.

In this order:

1. **An ADR for this Guest**, naming the Base Model, its provider pin, its Competitions and
   the spend it pre-approves: the per-call price, the Fixtures left and a ceiling. The
   scheduler spends without asking per run, so that statement is the approval, and raising
   the ceiling is a new ADR. At most two Guests stand at once, across all Competitions:

   ```sql
   select distinct base_model from models where role = 'guest' and withdrawn_at is null;
   ```

2. **A pre-flight in every Competition the Base Model has not answered**, as in section 3,
   each paid and asked for separately. Aim it at a temporary `candidate/…` row with the pin
   and config the Guest rows will carry, and delete that row once the report is read. A
   second `exhibition` row of the same Base Model stops the combined row (`pairUp` pairs
   one Exhibition with one Guest). A Guest row inserted before its pre-flight passed would
   be asked at the next Lock anyway, and its Gaps alert nobody.
3. **The insert**, by the operator. Production must be at the latest migration first:
   `npm run db:rehearse` says "Nothing to rehearse". If it rehearses anything else, apply
   it with `set -a; . ./.env; set +a; npm run --silent db:migrate` ("Applied N: …") and
   rehearse again. One `role = 'guest'` row per
   Competition at that Competition's Prompt Version, ids prefixed by Competition
   (`guest/…`, `guest-pd/…`, …, `guest-uecl/…`) so every row slugs alike.
   `docs/queries/gemini-4-argon-guest-rows.sql` is the shape; run it with
   `psql -P pager=off -v ON_ERROR_STOP=1 -f`. The Guest's first Lock is the first deadline
   after its `created_at`, and it is written back into the ADR. Insert more than two hours
   before that Lock, so the Lock − 2h `fill` run asks it at the latest. A row inserted in
   the last two hours counts that Lock as its first, no run asks it, and its record opens
   on Gaps.
4. **A top-up replay of any Exhibition row** to the Gameweek before that first Lock, once,
   approved separately as its own paid run, so the combined row has no hole. Skip it when
   the Exhibition row already ends at that Gameweek.
5. **No further Exhibition replay** in that Competition. The replay caps itself at the
   Guest's first Lock anyway (section 6), so a later run spends nothing there.

A Guest lasts until its Competition's next Edition boundary. That Edition's roster ADR
seats it, renews it or withdraws it, and an ADR that does not name it withdraws it
([Opening an Edition](opening-an-edition.md) §4d).
