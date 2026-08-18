# Tickets: Amending fpl/2026-27-v2 before its first use

Four tracer-bullet slices that land ADR-0041 through ADR-0026's open door before the
Season's first Lock — **2026-08-21T17:30Z** — under the spec's ship-or-freeze rule: the gate
is everything merged, `fpl:rehearse` green and the pre-cron checklist walked before the
Lock's cron takes over; whatever is frozen at the Lock is the Season's, and anything
unfinished waits for the next version.
Source: [spec 0019](../specs/0019-amending-fpl-2026-27-v2-before-its-first-use.md).
Decision: [ADR-0041](../adr/0041-duties-the-entrants-own-record-and-a-required-reason-join-fpl-2026-27-v2-before-its-first-use.md).
Vocabulary: [CONTEXT.md](../../CONTEXT.md), including **Rationale** and the widened
**Entrant Record**.

Work the **frontier**: the first two open at once; the template moves once, after both; the
gate closes last.

One rule shapes the whole set: **exactly one slice edits the template.** A template amended
twice in three days is two reviews of a Season-long freeze, so the first two slices prepare
storage and validation without touching a rendered sentence, and the third moves every
sentence at once.

---

## Duties into the record

**What to build:** The Lock's fetch carries FPL's set-piece and penalty orders into the
Gameweek's player rows, from the same bootstrap it already validates and archives — the
club-code pattern repeated for three nullable columns. Nothing renders them yet.

**Blocked by:** None — can start immediately.

- [x] A migration adds the three nullable duty columns to the Gameweek-scoped player rows,
      and the schema and migration suites cover it
- [x] The fetch projects all three from the bootstrap it archives; a player the source
      lists no duty for projects null, proven by replaying an archived bootstrap through
      the fetch seam
- [x] The seeded pool carries at least one player with a duty and one without, so the
      render slice has both states to draw
- [x] No template sentence changes; the context renders exactly as before

## The Rationale's storage and refusal

**What to build:** The FPL action requires a Rationale and the record keeps it. A scripted
response carrying one lands on the Manager State row; one missing it is refused as the
schema kind, costs a Repair, and succeeds on correction — the same contract the Match
track's Prediction has always had. The prompt's own text does not move yet: the loop suites
script their responses, and no cron calls an Entrant before the Lock.

**Blocked by:** None — can start immediately.

- [x] The action schema requires a Rationale string; a response without one fails as the
      schema kind — not a ViolationKind — and costs one Repair, driven through the Gameweek
      loop over a real Postgres
- [x] A migration adds the nullable Rationale column to the Manager State rows; a legal
      action's Rationale is stored, a Rolled Over Gameweek stores null, and the refused
      attempts keep holding their bodies verbatim
- [x] The opening stores one Rationale per seat, exercised through the track-start loop
- [x] The seed's scripted actions carry Rationales, so every downstream reader has real
      rows to read
- [x] Nothing scores or renders the Rationale anywhere

## The amended template, in one move

**What to build:** The one slice that touches what an Entrant reads. The pool line gains
the duty keys where the record holds them; the Manager State block gains the Entrant's own
record — the latest Settled Gameweek's Team Sheet with each pick's return and the armband's
contribution, and the Season points to date, always naming the Gameweek it reads; and the
shape line asks for the Rationale the schema already requires. Every render test moves in
the same change. Demoable: the FPL context command over the seeded Season shows the whole
amended packet.

**Blocked by:** "Duties into the record", "The Rationale's storage and refusal".

- [ ] The pool line renders each player's duties as optional keys, and a player without
      any renders exactly as today — the source's silence, not a null dressed as a fact
- [ ] The own-record block renders from stored facts only — the scorer's detail, the
      settled player points, the stored Team Sheet, the cumulative row — and computes no
      score of its own
- [ ] The block names the Gameweek it reads in all four states: a named ordinary week, the
      opening's announced absence, the post-Gap week naming the older Gameweek it reads,
      and the Rolled Over week showing the standing Sheet that played
- [ ] The shape line and the action schema agree on the Rationale to the byte
- [ ] No other seat's totals, no ranking, and no digest of the numbers appear anywhere in
      the packet
- [ ] The Exhibition splice still works on the amended template — the Manager State block
      it replaces carries the own-record block whole, with no blank line inside it to cut
      the splice's block detection short — proven through the FPL Exhibition replay suite
- [ ] The Exhibition path fills the own-record for itself: the armband's contribution and
      the running Season total computed with the scorer's own pure function over the shared
      player points as the replay walks, because its own scored rows do not exist yet by
      construction
- [ ] Every render assertion moved in this change and in no other

## The gate walked

**What to build:** The proof that the Season can run on the amended version, produced the
way the Season will run it. The rehearsal replays build, call, validate and store over an
archived Gameweek that genuinely exercises the amended template; the FPL suites pass whole;
the pre-cron checklist is walked; and the outcome — shipped or frozen — is recorded on this
file before the Lock's cron takes over.

**Blocked by:** "The amended template, in one move".

- [ ] `fpl:rehearse` is green over an archive that exercises the amended template — a
      rehearsal replaying a pre-amendment archive proves the old loop and does not count
- [ ] The FPL suites pass as a set: fetch, reducer, loop, render, seed, rehearsal
- [ ] The pre-cron checklist is walked, including the roster standing untouched under the
      unchanged version string
- [ ] The ship-or-freeze outcome is recorded here with a timestamp: what was frozen at the
      Lock, and what — if anything — waits for the next version
