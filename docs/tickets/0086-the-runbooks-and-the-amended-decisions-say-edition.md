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

**Status:** drafted, 2026-09-22

---

## What is already known

**A new runbook, "Opening an Edition".** The order, with the spend called out: the roster
ADR accepted (ADR-0061 rule 1) → each candidate pre-flighted alone as a temporary
`role = 'exhibition'` row (paid; ask) → the full new roster pre-flighted with
`EXPECTED_ENTRANT_COUNT` set to its size (paid; ask) → `withdrawn_at` stamped on the
leaving seats at the Edition's first Lock → `roster:enter` for the joining seats under the
standing Prompt Version → the Editions row inserted by the operator → the next daily
fetch and predict run pick it up with no further act. What is *not* done: no Prompt
Version bump, no `competitions` change, no hand-set Lock (ADR-0054). A table of the
expected Edition 2 boundaries per league with the caveat that the record decides.

**"A new Base Model arrives" gains a fourth door** — wait for an Edition — in its
date-driven table, and its "both tracks move together or neither moves" paragraph is
reworded to say exactly what it forbids (one Entrant name over two Base Models) and what
it does not (the two tracks seating different Base Models, ADR-0047), so that a reader
does not conclude an Edition must touch the FPL track.

**Amendment notes on the ADRs ADR-0061 changes.** ADR-0034: "irreversible from the first
Lock" is per Edition, and the 2026-08-19 cutoff binds Edition 1 while later Editions
take their opening ADR's date. ADR-0051: the Combined Ranking sums an Edition set.
ADR-0060: the *What it takes* paragraph's two demands — a per-Competition exclusion in
the roster module, the predict path reading `withdrawn_at` — are met by tickets 0081 and
0083, and the cup is its own Edition 1. Each note is a dated block at the top in the
house style (ADR-0059's amendment is the model), not a rewrite.

**Opening a Competition** gets one line: a Competition opens in Edition 1 and its Editions
row is seeded by the migration, so the cup column has nothing to add.

**The pre-cron checklist** gains one check before any Edition 2 Lock: the Editions row
exists for every league, the leaving seats are stamped, the joining seats are entered,
and the count of standing seats equals the roster ADR's size.

## Acceptance

- [ ] `docs/runbooks/opening-an-edition.md` exists, in the order above, with every paid
      step marked and the "no seat moves before the roster ADR" rule stated first.
- [ ] "A new Base Model arrives" has the fourth door and the reworded paragraph.
- [ ] ADR-0034, ADR-0051 and ADR-0060 each carry a dated amendment note naming ADR-0061
      and the ticket that landed the change; their bodies are otherwise untouched.
- [ ] The opening-a-Competition runbook and the pre-cron checklist carry their one
      addition each.
- [ ] No file outside `docs/` changes.
