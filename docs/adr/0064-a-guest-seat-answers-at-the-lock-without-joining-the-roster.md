---
status: accepted
---

# A Guest Seat answers at the Lock without joining the roster

> **Accepted 2026-10-15** by the operator, after a grilling session that settled every point
> below one by one. The Base Model that prompted it is named in ADR-0065, not here.

**A Base Model off the Season Roster may be asked every Fixture of a Competition at the same
Lock, over the same stored context, by the same scheduled run that asks the roster. It is a
Guest Seat (CONTEXT.md): a `models` row with `role = 'guest'`, ranked on the readable
rankings with a label, and kept out of every figure the roster publishes.** It exists
because the record had no way to read a late Base Model's forecasting skill. An Exhibition
Run (ADR-0032) only ever answers after the result, so it "supports no claim of forecasting
skill", and the only other way in, waiting for an Edition (ADR-0061), seats a Base Model on
no evidence this benchmark collected. A Guest Seat's answers all exist before their Lock,
so they carry no recall caveat, and they are the evidence the next roster ADR can cite.

## What a Guest Seat is, and what it is not

- **Asked live, on schedule, with the roster.** `predict:scheduled` selects it beside
  `entrant` and `shadow`, at each Gameweek's Lock, under `isAskedAtLock` like every seat. It
  answers from its first Lock after the row exists. No operator is involved per Lock: a
  missed manual run would be a Gap that could never be recovered.
- **Not an Exhibition Run.** An Exhibition Run is replayed after the result, and a Guest
  Seat answers before the Lock. The two never share a row. A row answering both ways would
  file recall-tainted and clean answers under one record, and the replay would skip every
  Fixture the Guest had already answered.
- **Not a Shadow Seat.** A Shadow Seat (ADR-0055) is an Entrant's own Base Model with
  reasoning off, and it is ranked nowhere. A Guest Seat shadows no Entrant, and it is
  ranked.
- **Any Competition.** The five leagues and the four cups alike, one row per Competition
  at that Competition's Prompt Version, ids prefixed by Competition (`guest/…`,
  `guest-pd/…`, …, `guest-uecl/…`) so they slug alike, as ticket 0080 learned for Exhibition
  rows.

## What it is entitled to, and what it is kept out of

- **Ranked, with a label, from its own first Lock.** It stands in the Competition's
  readable ranking labelled "Guest · from GW N". Its Season-to-date counts from that Lock,
  so its `n` is stated and is not the roster's.
- **Never in a roster figure.** It never selects or joins a Comparison Anchor, never enters
  the complete-case intersection or a published interval. It is no member of an Edition
  set. `/overall` shows it the way it shows an Exhibition Run (ADR-0052): summed, with the
  qualification that its total may cover fewer Fixtures. Every Entrant's score, order, Anchor, interval and Gap
  rate must be identical with Guest rows present and absent: the same invariant ticket
  0050 measured for Exhibition rows, and it is checked the same way.
- **Gaps recorded and shown, alerting nobody.** A Guest Gap is a Gap (CONTEXT.md): never
  back-filled, its rate shown beside its scores, since reliability is part of what a
  roster ADR will weigh. The Gap alert keeps its `role = 'entrant'` filter. A Guest failing
  at 3am wakes no one.

## How a Guest is named, and how long it sits

- **One ADR per Guest**, naming the Base Model, its provider pin, the Competitions, the
  first Lock, and the spend it pre-approves. This mechanism ADR seats nobody, as ADR-0061
  seated nobody.
- **At most two Guests at once**, across all Competitions. The weekly spend multiplies by
  the number, and every Guest is a Base Model someone chose to watch, so a small cap keeps
  that choice deliberate.
- **The cron's spend is approved once, in the Guest's ADR.** CLAUDE.md's rule that every paid
  run is asked first governs a run an agent or operator starts. A Guest's calls are started
  by the scheduler, so the Guest's ADR states the per-call price, the Fixture count and the
  ceiling, and that statement is the approval. Raising the ceiling is a new ADR.
- **It lasts until its Competition's next Edition boundary.** There, that Edition's roster
  ADR seats it, renews it, or ends it, and saying nothing ends it (`withdrawn_at` at the
  boundary's first Lock). Each Competition's boundary is its own, since the cups' Editions
  are not the leagues'.
- **A pre-flight in every Competition the Base Model has not yet answered**, before the
  first Lock, as the runbook asks of any row a Lock will call.

## Where an Exhibition Run and a Guest Seat meet

This amends ADR-0032.

- **An Exhibition Run stops where its Guest begins.** Once a Base Model has a Guest Seat in
  a Competition, its Exhibition row there is replayed only up to the Gameweek before the
  Guest's first Lock, and never past it. Otherwise one Base Model answers one Fixture
  twice, the operator pays twice, and the replay grows a recall-tainted record beside the
  clean one. ADR-0032 had the replay resolve its own coverage, with no range from the
  operator. The cap set here is not an operator's range. It is read off the record, from
  the Guest row's first Lock.
- **Read as one row by default, split on request.** Within one Competition and Edition, a
  Base Model's Exhibition row and Guest row are shown as one row, and a toggle splits them
  into two. The toggle means the same on every page: the Competition ranking, `/overall`,
  and the Entrant record. "Same" is the Base Model, not the dated snapshot it resolved to;
  a new snapshot is a resolution change a pre-flight reports, not a new Base Model.
- **The combined row says what it is made of.** While any answer in the range shown came
  from the replay, the combined row carries the Exhibition caveat and names the Gameweeks
  each part covers ("Exhibition GW1–6 · Guest from GW7"). A forecasting-skill claim is read
  only off the Guest's own row, in the split view. In a range the Guest covers alone, the
  combined row is the Guest row and carries no caveat.
- **Never combined with the roster.** Only Exhibition and Guest rows combine, never with an
  Entrant or a Shadow Seat, so the roster's figures cannot move because a guest arrived.
  `/overall` already keys Exhibition rows apart from the roster's (`exhibition:${slug}`).
  The combined key extends that separation, and does not replace it.

## Considered and not taken

- **Stretching "Exhibition Run" to cover live answers.** One word would then carry the
  recall caveat on half its rows and not the other half, and the label "ran after Gameweek
  N" would mean nothing on the live half.
- **Widening "Shadow Seat".** Its definition is a paired reading against one Entrant, and a
  Guest pairs with nobody.
- **An operator-triggered run before each Lock.** One missed weekend is a permanent Gap, for
  a row whose whole worth is an unbroken live record.
- **Never combining the two rows.** Kept as the split view. The default reads as one Base
  Model because the reader asked about one Base Model.

## What it costs

- **A fourth role** that every `role = …` filter has to decide about. The scorer currently
  excludes only `shadow`, the Gap alert includes only `entrant`, and the scheduled run
  admits `entrant` and `shadow`. Each of those becomes a choice made on purpose.
- **A recurring spend no one approves per run**, bounded by the Guest's ADR and the cap of
  two.
- **A ranking table that is longer and less uniform**: rows with different `n`, one more
  label, and a toggle.
