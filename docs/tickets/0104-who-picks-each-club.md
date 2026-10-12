# Ticket: Who picks each club

**What to build:** with `UCL` listed, the daily fetch reads the English Wikipedia article
of each of the cup's 36 clubs through the MediaWiki API, parses the infobox's manager
field, and stores one snapshot row per club per day. A `UCL` packet gives each side a
Head Coach line naming who picks the team as of the Lock. When two consecutive stored
snapshots before the Lock disagree, it adds a Change line dated by the first snapshot
that shows the change. It also carries one line saying the source has no appointment
date. `UCL`'s registry entry names the Wikipedia club infobox for its Head Coaches. That
name joins the `headCoaches` union in this ticket, not before (ticket 0099).

Source: ADR-0063 *Head coaches*, spec 0028 stories 35–42.

Decisions it must not bend:
- ADR-0045: the packet names who picks each team.
- Migration 0045's model: a Change is the difference between two snapshots, taking every
  disagreeing consecutive pair and not only the last.
- The MediaWiki API's etiquette: a contact User-Agent, serial requests.

**Blocked by:** 0100 (the 36 sides). **May be cut** for `UCL` at 2026-10-13T06:00Z, on
the same terms as ticket 0103.

**Status:** ready-for-agent

---

## What is already known

- **The article map is reviewed by hand and never searched.** A search for "<club>
  football club" picked the wrong page 8 times in 108 on 2026-10-12:
  - "FC Barcelona Femení"
  - "Borussia Dortmund II"
  - "Sabah F.C. (Malaysia)"
  - "AJAX Football Club"
  - "Banja Luka"
  - "HNK Hajduk Split in European football"
  - and others.

  This ticket writes the 36 `UCL` titles. 0107 and 0108 write their own.
- **The field** is `manager =` in most infoboxes. Some use `coach =` or `head coach =`,
  and a few carry `chrtitle`/`chairman` lines nearby that a loose pattern catches by
  mistake. Strip links, templates and tags. The value may hold a flag template or an
  "(interim)" note.
- **Acceptance cases**, read 2026-10-12, where the three candidate sources disagreed:
  - Lens: Yannick Cahuzac, since 15 September (Toppmöller left that day).
  - Lech Poznań: Niels Frederiksen.
  - Viktoria Plzeň: Radoslav Kováč.

  The infobox was right on all three. 365Scores had none for Lens or Lech and Hyský for
  Plzeň. UEFA's lineup had Toppmöller for Lens.
- **An empty or unparseable field** stores a null head coach for that day and does not
  fail. **A mapped article that is missing, or has no infobox**, fails `UCL`'s day by
  name, because that is a broken map entry.
- The Change computation is the national-team builder's single pass. Extract the shared
  pass only if a test forces both builders to change at once; otherwise write a parallel
  builder.

## Acceptance criteria

- [ ] Over archived wikitext, the parser reads Cahuzac, Frederiksen and Kováč, a vacancy as null, and a field wrapped in markup cleanly.
- [ ] One snapshot row per club per day; a re-read the same day upserts.
- [ ] A missing article fails `UCL`'s day by name; other Competitions land.
- [ ] A `UCL` packet shows a Head Coach line per side, a dated Change for snapshots A, B, B, and the no-appointment-date line; nothing observed after the Lock.
- [ ] The 36-title map is checked against the archive: every title resolves and every club is named once.
