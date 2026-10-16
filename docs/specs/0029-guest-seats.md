# Spec 0029 — Guest Seats

**Status:** ready-for-agent
**Scope:** a fourth `models` role, the scheduled Match run that asks it, the scorer and read API that rank it apart from the roster, the dashboard's combined view and its toggle, the Exhibition replay's cap, the single-model pre-flight door, and the two runbooks that name the doors a new Base Model can take. No change to the FPL track. Seating Gemini 4 Argon is ADR-0065's ticket, not this spec.
**Vocabulary:** [CONTEXT.md](../../CONTEXT.md) (Guest Seat, Exhibition Run, Shadow Seat, Edition, Gap) · **Decisions:** [ADR-0064](../adr/0064-a-guest-seat-answers-at-the-lock-without-joining-the-roster.md), [ADR-0065](../adr/0065-gemini-4-argon-is-the-first-guest-seat.md)

---

ADR-0064 adds a third way for a Base Model that missed the roster to enter the record: asked
live at every Lock, ranked with a label, and kept out of every figure the roster publishes.
This spec turns that decision into testable requirements.

Reads ADR-0032 (Exhibition Runs, amended by ADR-0064), ADR-0052 (an Exhibition Run shows up
wherever it answered), ADR-0055 (Shadow Seats and the role filter they widened), ADR-0061
(Editions, and the asked-at-Lock membership every seat is measured by) and ADR-0051 (the
combined ranking is a raw sum that states what it costs).

## Problem Statement

A Base Model released after an Edition's roster ADR has two ways into the record, and
neither answers the question an operator actually has about it: *can it forecast?*

An Exhibition Run replays it over played Gameweeks. Gemini 4 Argon did exactly that on
2026-10-14 and 15 and answered 288 of 291 league Fixtures, but every one of those answers
came after the result, so the record says outright that the figures support no claim of
skill. The other way in is to wait for the next Edition and be seated on the strength of a
catalog entry and a pre-flight. The benchmark collects no evidence that would justify that
seat.

The scheduled run only asks the roster and its Shadows, so there is no way to put a late
Base Model in front of a Fixture before its Lock. The answers that would count as evidence
are the ones the record cannot collect.

## Solution

A **Guest Seat**: a `models` row with `role = 'guest'` that the scheduled run asks at every
Lock, over the same stored context and through the same call path as the roster. It is
scored, ranked on the Competition's tables with a "Guest · from GW N" label, shown on the
Fixtures it was asked, and given a record. It never touches a Comparison Anchor, the
complete-case intersection, a published interval, an Edition set's membership or the Gap
alert. Every roster figure is identical with Guest rows present or absent.

Where the same Base Model also has an Exhibition Run in that Competition and Edition, every
page shows the two as **one combined row by default**. A toggle splits it back into two. The
combined row carries the Exhibition caveat and names its parts while any replayed answer is
in range. The Exhibition replay stops at the Gameweek before the Guest's first Lock, so the
two parts never overlap.

## User Stories

1. As an operator, I want to seat a late Base Model as a Guest by inserting one `models` row per Competition, so that it starts answering at the next Lock without a code change.
2. As an operator, I want a Guest to be asked by the same scheduled run as the roster, so that no weekend's Fixtures depend on my remembering to start a run.
3. As an operator, I want a Guest to answer from the first Lock after its row exists and never before, so that the insert decides its first Lock and nothing back-dates it.
4. As an operator, I want a Guest asked over the exact stored context row the roster is shown, so that its answers are verifiable against the same hash.
5. As an operator, I want a Guest called with its own pinned provider and quantization, the Competition's frozen Prompt Version and the same three Repairs, so that it differs from an Entrant only in which row is called.
6. As an operator, I want a Guest's attempts logged in the ledger under the scheduled trigger like any seat's, so that cost and latency are readable the same way.
7. As an operator, I want the scheduled run to refuse to run with Guests and no Entrant, so that a misconfigured Competition fails loudly instead of asking only a guest.
8. As an operator, I want a Guest row in a Competition with no Lock left to cost nothing, so that a stray row is harmless.
9. As an operator, I want to aim the single-model pre-flight at a Guest row, so that I can check it on a new Competition's Prompt Version before its first Lock.
10. As an operator, I want setting `withdrawn_at` to stop a Guest from its next Lock, so that ending it at an Edition boundary uses the mechanism seats already use.
11. As an operator, I want a Guest's Gap to raise no Gap alert, so that a failing guest does not wake anyone.
12. As an operator, I want a Guest's Gap recorded and never back-filled, so that its reliability is part of its record.
13. As an operator, I want the Exhibition replay to stop at the Gameweek before the Guest's first Lock when the same Base Model holds both in a Competition, so that I never pay twice for one Fixture.
14. As an operator, I want that cap read off the record, so that I never pass a Gameweek range and cannot pass a wrong one.
15. As an operator, I want an Exhibition replay of a Base Model with no Guest to behave exactly as today, so that the cap changes nothing it does not need to.
16. As an operator, I want a replay that the cap leaves with nothing to do to say so and spend nothing, so that running it is safe.
17. As an operator, I want the runbook for a new Base Model to list the Guest door beside the Exhibition and Edition doors, so that I choose by what I want to learn.
18. As an operator, I want the Edition-opening runbook to tell me to seat, renew or withdraw every Guest at the boundary, so that silence ending a Guest is a step and not an accident.
19. As a reader of a Competition's ranking, I want a Guest ranked among the Entrants by the same ordering, so that I can see where it stands.
20. As a reader, I want the Guest labelled "Guest · from GW N", so that I know it is not a roster seat and when it started.
21. As a reader, I want a Guest's Season-to-date counted from its first Lock, with its `n` shown, so that a shorter record is not mistaken for a worse one.
22. As a reader, I want a Guest's row free of the recall caveat when every answer in range was given before its Lock, so that clean evidence is not discounted.
23. As a reader, I want a Guest's Gap rate shown beside its scores, so that a guest that answers selectively cannot look better than it is.
24. As a reader, I want one row per Base Model by default when an Exhibition Run and a Guest of that Base Model sit in the same Competition and Edition, so that I am not shown the same Base Model twice.
25. As a reader, I want the combined row to name its parts ("Exhibition GW1–6 · Guest from GW7"), so that I know which answers came from where.
26. As a reader, I want the combined row to carry the Exhibition caveat while any replayed answer is in range, so that I do not read it as forecasting skill.
27. As a reader, I want a toggle that splits the combined row into the Exhibition row and the Guest row, so that I can read the Guest's clean figures on their own.
28. As a reader, I want the toggle's state in the URL, so that a link to the split view opens split.
29. As a reader, I want the toggle to mean the same on the Competition ranking, `/overall` and the entrant record, so that one Base Model's numbers agree across pages.
30. As a reader, I want the toggle hidden on a page where no Base Model has both kinds of row, so that the page is unchanged where it has nothing to do.
31. As a reader, I want a Base Model's rows combined across snapshot changes, so that a new dated slug does not split one Base Model in two.
32. As a reader, I want a Guest never combined with an Entrant or a Shadow, even of the same Base Model, so that the roster's rows mean exactly what they meant.
33. As a reader, I want a Guest's forecast on every Fixture it was asked, and an empty slot where it was asked and did not answer, so that the Fixtures page means what it means for Entrants.
34. As a reader of a Guest's record, I want what an Entrant's record publishes, Gap rate included, so that the two are directly comparable.
35. As a reader of a combined record, I want its Gameweek-by-Gameweek history to show which part answered each Gameweek, so that the switch from replay to live is visible.
36. As a reader of `/overall`, I want a Guest summed across the Competitions it sits in, with the qualification Exhibition rows carry, so that a guest in fewer leagues is read as such.
37. As a reader of `/overall`, I want the combined row and its split there too, so that the default view sums one Base Model once.
38. As a reader of a closed Edition's pages, I want them unchanged byte for byte when no Guest sat in that Edition, so that the archive does not move. *(Amended 2026-10-16 by ticket 0119: byte for byte no longer holds. 0119 bundled the ranking page's script, which changes every ranking page's HTML, and every Exhibition row's leaderboard body gains `firstGw`/`lastGw`. A closed Edition's pages must still draw as they did. Where nothing combines, the rows pass through as they came and the toggle stays hidden. This is checked by eye in [0121](../tickets/0121-gemini-4-argon-takes-its-guest-seat.md).)*
39. As a reader of the Nations League or a UEFA club cup, I want a Guest there treated exactly as in a league, so that a guest's record means the same everywhere.
40. As the benchmark, I want every Entrant's score, order, Comparison Anchor, interval and Gap rate identical with Guest rows present and absent, so that no guest can move a published roster figure.
41. As the benchmark, I want a Guest excluded from the complete-case intersection, so that a guest's Gap cannot shrink the roster's comparison set.
42. As the benchmark, I want a Guest never to join an Edition set, so that the Combined Ranking's membership is still decided by roster ADRs alone.
43. As a maintainer, I want each place that filters on `role` to decide about `guest` explicitly, so that the fourth role is not admitted or excluded by accident.

## Implementation Decisions

- **Schema.** `models_role_check` widens to admit `'guest'`, in one migration. It widens only, so no row rewrite and no guard, as migration 0019 did for `'exhibition'`. Nothing else in the schema changes. A Guest row is shaped like an Exhibition row: id prefixed by Competition (`guest/…`, `guest-pd/…`), the Competition's Prompt Version, pinned provider and quantization, and `config` holding class, canonical slug and catalog date, which never reaches the wire (ADR-0055's correction).
- **The role type.** `ModelRole` gains `"guest"`. Every query that filters on `role` is enumerated in the ticket that adds the role, with its decision written beside it:
  - the scheduled run's roster and work selects admit `guest`;
  - the "no Entrants configured" refusal still asks for an `entrant`;
  - the scorer's scored-rows select admits it, since it excludes only `shadow`;
  - the Comparison Anchor, complete-case and interval selects stay `entrant` only;
  - the Gap alert stays `entrant` only;
  - the read API admits it under its own branch;
  - the Exhibition loader's default stays `['exhibition']`;
  - the pre-flight's single-model door admits `guest`.
- **Membership.** A Guest is asked at a Lock exactly when an Entrant would be, by the same asked-at-Lock rule (`created_at` before the Lock, `withdrawn_at` absent or after). Its first Lock is the first Gameweek of the Competition whose deadline follows its `created_at`. That Gameweek is the "from GW N" in its label, the start of its Season-to-date and the Exhibition cap's ceiling. It is one derivation, used by all three.
- **Gaps.** A Guest's Gap is counted over the Fixtures it was asked at a Lock, as an Entrant's is, and never over Fixtures before its first Lock. Its Gap rate is published on its row and record. It does not inherit the withholding ADR-0052 applies to Exhibition Runs, because a Guest's Gap is a missed deadline, the same meaning as an Entrant's.
- **The Exhibition cap.** The Match replay drops every Gameweek at or after the first Lock of a Guest row sharing its `base_model` and Competition. With no such row it behaves exactly as today. No environment variable is added. The FPL replay is untouched.
- **Read API bodies.** Each ranked row, Fixture forecast, record and `/overall` row carries its role and its `base_model`, so a client can tell an Exhibition, a Guest and an Entrant apart and find the rows of one Base Model. A Guest row carries `guest: { fromGw }` beside the existing `exhibition: { ranAfterGw }`. Both are null on an Entrant. The bodies always return the split rows. The read API does not combine them.
- **Combining is a pure function on the client side**, beside the module that sums `/overall`. It takes one page's split rows and returns the combined rows: one per Base Model that has both an Exhibition and a Guest row in that body. Additive figures (Match Points, Bet Points, exact scorelines, correct outcomes) are summed. RPS is the `n`-weighted mean. `n` is summed. Gap rate is the Guest part's alone, since the Exhibition part's is withheld. The rank is recomputed by the page's existing ordering. Rows of any other role pass through untouched. A combined row carries `parts: { exhibition: {firstGw, lastGw}, guest: {fromGw} }` and the Exhibition caveat while its Exhibition part is non-empty in the range shown.
- **The toggle.** It is a query parameter (`?rows=split`), default combined, read by every page that ranks rows. It renders only when the body holds at least one Base Model with both kinds of row. A page without one is unchanged.
- **The entrant record.** Under the default, a combined record is one history whose Gameweek rows each name the part that answered. Under split, the Exhibition record and the Guest record are separate. The two rows of one Base Model share a slug by ADR-0064's id convention, so the record is addressed by that slug, and the toggle chooses between combined and split. No new route.
- **Fixtures page.** A Guest's forecast appears on every Fixture it was asked, and is an empty slot where it was asked and has no Prediction, as an Entrant's is. The toggle does not apply there: each Fixture is answered by one part at most.
- **`/overall`.** Guest rows are summed across Competitions by slug under a `guest:` key, kept apart from the roster's keys as Exhibition rows already are (`exhibition:`). The combine step then merges `exhibition:` and `guest:` rows of one Base Model. The Edition-set qualification gains the Guest alongside the Exhibition sentence ADR-0052 froze.
- **Frozen text.** The "Guest · from GW N" label and the combined row's parts sentence are constants in the dashboard's frozen-text module, never rows.
- **Runbooks.** "A new Base Model arrives" gains a Guest door beside sections 6 and 8. "Opening an Edition" gains a step: every Guest in the Competition is seated, renewed or withdrawn by the roster ADR, and one the ADR does not name is withdrawn at the boundary's first Lock.
- **The two-Guest cap is governance, not code.** ADR-0064 caps concurrent Guests at two. It is enforced by requiring an ADR per Guest, not by a constraint. A constraint would have to count across Competitions and through `withdrawn_at`, for a rule that changes only by ADR.

## Testing Decisions

A good test here drives the system through the doors an operator and a reader actually use: a scheduled run against a real Postgres, the replay, the scorer, and the read API's HTTP handler. It asserts what comes out of the database or the response body, never which query ran.

**The seams, highest first:**

1. **One coexistence test across the whole path**, modelled on `exhibition-candidate-coexistence`. Seed a Season, insert a Guest beside the roster, and run `predictGameweek` with a fake HTTP fetcher. Score it, then read every per-Competition body through `handleDashboardRequest`, the alert through `readGapAlert`, and the pre-flight through `preflightBaseModels`. This is the main seam. It carries stories 1–12, 19–23, 33–34 and 40–42, and especially the roster-invariance assertion. That assertion seeds once, scores with and without the Guest rows, and requires every Entrant figure (score, order, Anchor, interval, Gap rate, `scored_at`) to be identical, the same check ticket 0050 measured by hand.
2. **The replay.** `replayMatchExhibition` against a seeded Season with and without a Guest of the same Base Model. It asserts the Gameweeks covered and the calls made, including a run left nothing to do that spends nothing. Prior art: `replay-match-exhibition.test.ts`.
3. **The combine function and the toggle**, as pure modules over split bodies. They check the summed, `n`-weighted and Guest-only figures, the parts sentence, the caveat on and off by range, and that Entrant and Shadow rows pass through. They also check the toggle's absence when nothing combines, and byte-identical rendering of a closed Edition with no Guest. *(Amended 2026-10-16 by ticket 0119: no byte-identical rendering check. What is tested is that rows pass through unchanged where nothing combines, and that `/overall` is not `splittable`. The rendered closed-Edition page is checked by eye in 0121, as story 38's amendment says.)* Prior art: `dashboard-overall-view.test.ts`, `dashboard-competition-view.test.ts`.

No new seam is introduced: each of the three exists today, and the work adds cases to them. The migration's widening joins the migration lists the suites keep. A new migration is several list edits, and `rehearse-migration` is among the suites a targeted run will not find.

## Out of Scope

- The FPL track. A Guest is a Match-track seat, and the FPL track's insert-only Manager States make a mid-Season seat a different question.
- Seating any specific Base Model. Gemini 4 Argon is ADR-0065's ticket: its nine rows, its four cup pre-flights, the top-up replay of its Exhibition rows to its first Lock, and writing that first Lock back into ADR-0065.
- A Shadow of a Guest, or a Guest of a Shadow.
- Enforcing the two-Guest cap in the database.
- Back-filling a Guest's missed Lock with a replay. A Gap stays a Gap.
- Combining across Competitions on a Competition page, or across Editions anywhere.

## Further Notes

- The roster-invariance assertion is the spec's main acceptance check. Every ticket that touches a select reruns it, so it is written once, in the coexistence test, and the tickets point at it.
- Order matters at activation: the code ships, then the cup pre-flights run, then the rows are inserted (which sets the first Lock), then one top-up Exhibition replay closes the gap to that Lock. The cap in this spec is what makes that last replay safe to run more than once.
- The cost a Guest incurs is approved in its own ADR (ADR-0065: about $13.4 to Season's end, $20 ceiling). This spec adds no spend.
