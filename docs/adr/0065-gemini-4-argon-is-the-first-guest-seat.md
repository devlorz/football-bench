---
status: accepted
---

# Gemini 4 Argon is the first Guest Seat

> **Accepted 2026-10-15** by the operator, together with ADR-0064. The spend ceiling below
> was proposed in drafting; the operator may lower it before the first Lock, and raising it
> later is a new ADR.
>
> **Amended 2026-10-16, by ticket 0121: the leagues' first Locks.** The operator inserted
> the five league rows at 2026-10-16 09:35:27Z, after `origin/main` carried 0114–0118
> (`975fd12`) and migration 0052. Each row's first Lock is the first deadline after that
> instant:
>
> | Competition | Row | First Lock |
> | --- | --- | --- |
> | BL1 | `guest-bl1/gemini-4-argon` | GW6, 2026-10-16 17:00Z |
> | FL1 | `guest-fl1/gemini-4-argon` | GW7, 2026-10-16 17:15Z |
> | SA | `guest-sa/gemini-4-argon` | GW7, 2026-10-16 17:15Z |
> | PD | `guest-pd/gemini-4-argon` | GW9, 2026-10-16 17:30Z |
> | PL | `guest/gemini-4-argon` | GW7, 2026-10-17 10:00Z |
>
> Each follows directly on the last Gameweek of that league's Exhibition rows: BL1 GW5,
> PL/SA/FL1 GW6 and PD GW8. So the top-up replay in step 4 of *Before the first Lock* had
> nothing to cover and was not run. The four cup rows are still to come, after their
> pre-flights; their first Locks are added here when they are inserted.

**Gemini 4 Argon sits as a Guest Seat (ADR-0064) in all nine Competitions: the five
leagues, the Nations League and the three UEFA club cups.** It was listed on OpenRouter on
2026-10-13, after ADR-0062's date, so no Edition 2 seat was open to it (ADR-0061 rule 4).
On 2026-10-14 and 15 it was replayed as an Exhibition Run over every played league Fixture
(commit `3715342`, `docs/queries/gemini-4-argon-exhibition-rows.sql`). It answered 288 of
291, at about $2.12, with no Repair and no refusal. That replay showed it answers the frozen
prompts. It cannot show whether it forecasts, and this Guest Seat is how the record finds
out. It is the first of the two Guests ADR-0064 allows.

## The seat

| | |
| --- | --- |
| `baseModel` | `google/gemini-4-argon` |
| Canonical slug | `google/gemini-4-argon-20261013` (resolved by the 2026-10-14 pre-flight and every replay call) |
| Provider pin | `google-vertex`, `quantization` null. Every endpoint reports `unknown`. Plain `google-ai-studio` was at status −2 on 2026-10-14 while every Vertex endpoint was at 0 |
| Class | Frontier |
| Price in / out per M tokens | $2 / $10 (catalog, 2026-10-14) |
| Rows | `guest/gemini-4-argon` (PL), `guest-pd/…`, `guest-sa/…`, `guest-fl1/…`, `guest-bl1/…`, `guest-unl/…`, `guest-ucl/…`, `guest-uel/…`, `guest-uecl/…` |

## What it costs, stated before it is spent

Output is priced from the replay: Argon averaged about 180 output tokens per call, against
about 1,300 for Gemini 3.1 Pro Preview on the same prompts. Input is Argon's own replay
average for the leagues, and Gemini 3.1 Pro Preview's for the cups Argon has not answered.
Fixtures are those unplayed in `fixtures` on 2026-10-15. The cups' knockout rounds are not
in the table yet.

| Competition | Fixtures left | Input tokens / call | Est. / call | Est. to Season's end |
| --- | --- | --- | --- | --- |
| PL | 320 | 3,860 | $0.0095 | $3.05 |
| PD | 301 | 2,261 | $0.0063 | $1.90 |
| SA | 320 | 2,565 | $0.0069 | $2.22 |
| FL1 | 252 | 2,434 | $0.0067 | $1.68 |
| BL1 | 261 | 2,492 | $0.0068 | $1.77 |
| UCL | 108 | 2,890 | $0.0076 | $0.82 |
| UEL | 126 | 3,195 | $0.0082 | $1.03 |
| UECL | 108 | 2,256 | $0.0063 | $0.68 |
| UNL | 52 | 1,349 | $0.0045 | $0.23 |
| **Total** | **1,848** | | | **≈ $13.4** |

**Pre-approved ceiling: $20 for the Season**, which leaves room for the cups' knockouts and
for Repairs. That is about $0.35 a week while only the leagues play. The table runs to the
Season's end because no next Edition boundary is named yet. The seat ends at its
Competition's next boundary unless that boundary's ADR renews it (ADR-0064), so the actual
spend can only be lower.

## Before the first Lock

1. **The code ADR-0064 requires is deployed**: the `guest` role, the scheduled run that
   admits it, the scorer and readers that rank it apart, the combined view, and the
   Exhibition cap.
2. **Four pre-flights**, one each in UNL, UCL, UEL and UECL, on Prompt Versions Argon has
   never answered: 4 calls, about $0.03, each asked for separately. The five leagues need
   none, since the replay already exercised them.
3. **The nine rows are inserted by the operator.** A Guest answers from its first Lock after
   its row exists, so the insert is what sets the first Lock, and that Lock is written
   back into this ADR as an amendment.
4. **The Exhibition rows are brought up to that Lock.** The leagues' Exhibition rows end at
   PL/SA/FL1 GW6, BL1 GW5 and PD GW8. Any league Gameweek played between that point and the
   Guest's first Lock is replayed once, as a separately approved paid run, so the combined
   row has no hole. After that the Exhibition rows are never replayed again (ADR-0064).

## What this does not decide

Whether Argon holds a seat in any later Edition. Its Guest record is evidence for that
roster ADR, which still has to state its grounds.
