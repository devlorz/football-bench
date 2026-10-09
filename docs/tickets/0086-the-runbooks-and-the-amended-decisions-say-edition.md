# Ticket: The runbooks and the amended decisions say Edition

**What to build:** an operator can open an Edition from the runbooks alone, in the right
order and without spending before the roster ADR is accepted; the decisions ADR-0061
amends carry a note saying so at the top; and ADR-0060's "what it takes" points at the
tickets that took it. Documentation only — no code, no migration, no production write.
Source:
[ADR-0061](../adr/0061-a-competition-reopens-its-roster-at-an-edition-boundary.md),
*Consequences*.

**Blocked by:** 0085 (the runbook describes commands and pages that exist only once
0081–0085 have landed).

**Status:** drafted, 2026-09-22; done 2026-10-09 (documentation only)

---

## What is already known

**A new runbook, "Opening an Edition".** The order, with the spend called out: the roster
ADR accepted (ADR-0061 rule 1) → each candidate pre-flighted alone as a temporary
`role = 'exhibition'` row (paid; ask) → the full new roster pre-flighted with
`EXPECTED_ENTRANT_COUNT` set to its size (paid; ask) → `withdrawn_at` stamped on the
leaving seats at the Edition's first Lock → `roster:enter` for the joining seats under the
standing Prompt Version → the Editions row inserted by the operator → the next daily
fetch and predict run pick it up with no further act. For up to a minute after the
insert, `/api/edition-N/...` may still answer the edge-cached 404 (the read API's `NOT_FOUND_CACHE`);
that is the cache, not a missing row. Right after the insert, the dashboard gains its
`CLOSED_LEAGUE_EDITIONS` entry (`{ number: 1, openedBy: "ADR-00NN" }`, ticket 0085) and is
deployed. Until that deploy, there are no `/edition-1/...` pages, and La Liga's retired block
on `/pd` reads "could not be read", because the unprefixed `/retired` 404s once Edition 2
exists. What is *not* done: no Prompt
Version bump, no `competitions` change, no hand-set Lock (ADR-0054). A table of the
expected Edition 2 boundaries per league with the caveat that the record decides.

**"A new Base Model arrives" gains a fourth door** — wait for an Edition — in its
date-driven table, and its "both tracks move together or neither moves" paragraph is
reworded to say exactly what it forbids (one Entrant name over two Base Models) and what
it does not (the two tracks seating different Base Models, ADR-0047), so that a reader
does not conclude an Edition must touch the FPL track.

**Amendment notes on the ADRs ADR-0061 changes.** ADR-0034: "irreversible from the first
Lock" is per Edition, and the 2026-08-19 cutoff binds Edition 1 while later Editions
take their opening ADR's date. ADR-0051 is already done: ticket 0085 amended it when `/overall` stopped summing the cup.
ADR-0060: the *What it takes* paragraph's two demands — a per-Competition exclusion in
the roster module, the predict path reading `withdrawn_at` — are met by tickets 0081 and
0083, and the cup is its own Edition 1. Each note is a dated block at the top in the
house style (ADR-0059's amendment is the model), not a rewrite.

**Opening a Competition** gets one line: a Competition opens in Edition 1, and migration
0048 seeds that row for `2026-27` only. Opening any later Season inserts an Edition 1
row at Gameweek 1 for every Competition before the first scoring run, or `readEdition`
refuses the Season and the scorer scores nothing (ticket 0097). The cup column has
nothing to add.

**The pre-cron checklist** gains one check before any Edition 2 Lock: the Editions row
exists for every league, the leaving seats are stamped, the joining seats are entered,
and the count of standing seats equals the roster ADR's size.

## Acceptance

- [x] `docs/runbooks/opening-an-edition.md` exists, in the order above, with every paid
      step marked and the "no seat moves before the roster ADR" rule stated first.
- [x] "A new Base Model arrives" has the fourth door and the reworded paragraph.
- [x] ADR-0034, ADR-0051 and ADR-0060 each carry a dated amendment note naming ADR-0061
      and the ticket that landed the change; their bodies are otherwise untouched.
- [x] The opening-a-Competition runbook and the pre-cron checklist carry their one
      addition each.
- [x] No file outside `docs/` changes.

## Evidence

- **Box 1.** The runbook landed in `8bad518`. ADR-0062 used it on 2026-10-08 to open
  Edition 2 on production (`7be27e8`). This ticket added the three items the
  description asked for and that commit lacked:
  - the per-league boundary table under §4c, with the caveat that the `editions` rows
    decide;
  - the `NOT_FOUND_CACHE` minute in §5;
  - the "what is not done" line in §0.
- **The deploy order.** The description says to deploy "right after the insert", and so
  did ADR-0062's *What it takes*. The runbook deploys before the inserts (§3), because
  cron runs `origin/main` before the earliest Lock − 6h. A constant that waits for its rows
  is the window ticket 0085 designed. The operator followed the runbook. ADR-0062 now
  carries a dated correction. This description is left as drafted.
- **Box 2.** In *A new Base Model arrives*:
  - The table is keyed by date. After the first Lock, the Exhibition Run is the door now.
    A seat comes only at the next Edition, if its roster ADR names it and the Base Model
    was released before that ADR's date (rule 4).
  - §8 leaves the choice to name it with the ADR.
  - The "both tracks" paragraph says what ADR-0034 forbids, one Entrant name over two
    Base Models. It also says what it does not: the tracks seating different Base Models
    (ADR-0047, ADR-0061 rule 6). Rule 6 is stated there once.
  - The Decisions header gains ADR-0047, 0061 and 0062.
- **Box 3.** ADR-0051's note came from ticket 0085. ADR-0034 and ADR-0060 each gain their
  own dated blockquote, "by ticket 0086, under ADR-0061", and their bodies are unchanged.
  The notes say who did what:
  - Tickets 0081 and 0098 built rosters of record.
  - The operator entered the seats (ticket 0076 for the cup; ADR-0062 for the leagues).
  - ADR-0034's note adds that the FPL-start edge does not move (rule 6).
  - ADR-0060's note keeps the body's two conditions, and keeps 0083's filter as
    not needed for the cup.
- **Box 4.**
  - *Opening a Competition* covers both a Competition opened within `2026-27` and a later
    Season, because migration 0048 seeds only the six. It gives the operator's insert.
  - The pre-cron box applies to any Edition's first Lock from Edition 2 on, and counts
    per Competition.
- **Box 5.** `git diff --stat` touches `docs/` only.
- **Reviews.**
  - First code-review (Standards and Spec in parallel): the user approved 14 verdicts,
    11 fixed and 3 declined.
  - Second review, pasted by the user: 15 verdicts, 12 fixed and 3 declined. The three
    declined:
    - "Season" in §2–5 stays, because before the first Lock the Season Roster is
      Edition 1's.
    - The pre-cron box keeps its four checks, because box 4 names them.
    - ADR-0034 keeps naming 0098, because it is the ticket that landed the change.
  - Two of the first round's notes had said a ticket "seated" seats. Tickets build
    rosters; the operator seats them. One first-round reason was wrong: "standing seats"
    was a phrase this diff introduced, not house usage, and it is now "seats not
    withdrawn".
