# Ticket: A seat leaves a track and keeps its record

**What to build:** a Base Model can leave one track's Season Roster without leaving the
database. A withdrawn seat keeps its id, its Base Model, its attempts and its contexts, and
gains the date it left. The FPL track then opens for the seats that stand, refuses a roster
of the wrong size against its own expected count, and everything the operator reads before
a Lock reads the same roster the run will call. The Match track is untouched. Source:
[spec 0023](../specs/0023-seven-seats-open-the-fpl-track.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md) — **Season Roster**, **Entrant**, **Base Model**, **Track**,
**Lock**, **Prompt Version**. Decision:
[ADR-0047](../adr/0047-three-seats-leave-the-fpl-track-before-its-first-lock.md).

**Blocked by:** 0027 — the withdrawal list is that ticket's output.

**Status:** ready-for-agent

The only removal this project has performed deleted the rows, and that is unavailable here:
the attempt store and the context store both reference `models`, and both hold last night's
rows for every seat being withdrawn. Those rows are the evidence the decision is read from.
So the row stays and gains a date, and the reads learn to skip it — on the FPL track only,
because a track's withdrawal is a fact about that track's row and the two tracks seat
different rows for one Base Model.

- [ ] A migration adds a nullable withdrawal timestamp to `models`. No default, no
      backfill, and no constraint tying it to the Entrant role — a Reference Line has no
      roster to leave, and a guard for a state nobody can reach is one nothing has ever
      seen bite. Its comment carries ADR-0047's reason for not deleting.
- [ ] The roster module names the withdrawn seat ids in exactly one place, each with the
      date it left and a one-line reading of why, in the voice the roster's own entries
      carry.
- [ ] The FPL track's expected roster size is **derived** — the roster's length less the
      withdrawal list's — and never written as a literal, so the gate's outcome cannot
      leave the guard describing a roster that does not exist.
- [ ] The Match track's size constant keeps its number and its doc comment says which
      track it now speaks for, pointing at the FPL one.
- [ ] The FPL entry door stamps the date onto the withdrawn seats after seating the
      roster, and leaves every standing seat's null. Running it twice neither clears a date
      nor moves it.
- [ ] The shared seat upsert never mentions the column, which is what makes a re-run of
      either door incapable of reinstating a withdrawn Base Model.
- [ ] The opening's Entrant read skips withdrawn seats, and its count guard is measured
      against the FPL expected size. The refusal names the size expected and the size found.
- [ ] The guard takes its expected size as an option. The FPL rehearsal seats ten
      *behavioural* seats under the FPL Prompt Version and then calls the opening, so a
      guard hard-wired to the Season's size would break the rehearsal or cost it three of
      the behaviours it exists to prove. The rehearsal passes its own seat count.
- [ ] The rehearsal's verifier counts its seat script rather than the Season Roster — which
      is what it always meant, a rehearsal seat being a behaviour and not a Base Model.
- [ ] The context renderer shows exactly the seats the run will call, so what the operator
      reads before a Lock is what the run reads.
- [ ] The FPL job's default concurrency follows the FPL track's expected size. It stays a
      default; the environment override is the lever ticket 0027 turns on.
- [ ] The Gameweek run's Entrant read is **not** filtered, and says why inline: it reads by
      id from the started-roster record, which is already the record of which seats hold a
      Season path, and a filter there would state the same fact twice in a place then free
      to disagree with itself.
- [ ] No `models` row, attempt or context is deleted.
- [ ] CONTEXT.md's Season Roster entry — already written and uncommitted — ships in this
      commit: a roster per track, the withdrawal field named, and a seat playing every
      Gameweek of its track's Season or not being on that track's roster at all.
- [ ] Tests at the existing seams: the FPL door leaves standing seats null and withdrawn
      seats dated; a second run changes nothing; a withdrawn seat carrying an attempt row
      and a context row still carries both and still has its `models` row; the Match door
      leaves all ten Match seats null, including the Base Models withdrawn from the other
      track; the opening proceeds at the expected size and is refused by a database still
      holding every seat unwithdrawn; the migrations suite sees a nullable column with no
      default; the rehearsal suites still run ten behavioural seats and still verify
      against ten. The two remaining suites that import the Match size constant — the
      settled-player-points suite and the Gameweek-run suite — seed their own seats and
      never reach the guard, so they are unaffected; checked, and written here so the next
      reader does not re-derive it.

## Not in this ticket

**The dashboard.** Its three FPL reads are ticket 0029, so this ticket's page still shows
every seat. That is deliberate: the run and the record are what the Lock needs, and the
page can be a Gameweek late without costing a Season path.

**The structural test** that stops a future read site forgetting the filter — ticket 0030,
after every read site is final.

**Applying any of this to production** — ticket 0031.

**A path back for a withdrawn seat.** There is none and this ticket does not build one. The
roster closes at the first Lock and a withdrawn Base Model returns only as an Exhibition
Run, which supports no claim of forecasting skill. Nothing here needs a write that clears
the date, so nothing writes one.

**Withdrawal on the Match track.** The column would work there; no Match seat is being
withdrawn and no Match read is filtered. The day one is, that is its own ADR.

**A reasoning cap for the ceiling-bound seat, and a third raise of the output ceiling.**
Both rejected in ADR-0047 and in ticket 0026 respectively, for reasons that do not move.
