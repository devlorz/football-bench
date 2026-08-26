# Ticket: Germany's transfer page parses

**What to build:** the Bundesliga's Squad Changes, end to end — the country's two transfer
windows written down with their page titles and their format, the eighteen clubs mapped to
their Wikipedia identities, and the real archived page parsed into stored rows. Source:
[opening a Competition](../runbooks/opening-a-competition.md) edit 6 and §4. Decisions:
[ADR-0054](../adr/0054-the-bundesliga-opens-and-nothing-has-been-lost-yet.md),
[ADR-0031](../adr/0031-squad-changes-join-the-match-context-for-2026-27-v2.md).

First, and not last, because writing a Competition's windows down opens the Squad Changes
gate and changes what its packet renders. Landing this after ticket 0058 moves a pinned
sha that has no reason to move.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

---

## What is already known

**The format is unknown and is not guessable from the title.** The runbook records three
shapes across four countries: England's two wikitables (`twoTables`), Italy's one
(`oneTable`) with loans stated in the fee column, and Spain's and France's club sections of
`{{fs player}}` lists with no date and no fee anywhere on the page (`clubSections`).
Germany is the fifth country and may be a fourth shape. Read the page before writing the
window down: look for `{|` under a heading — none means club sections; one or more means
count the tables.

Every previous country also brought page furniture that was a silent refusal until the
reader was widened — Italy's `{{dts}}` dates and `{{Sort}}` names, France's bare-text club
headings that made the *displayed* name the identity. Assume Germany brings its own and
find it on the archived bytes, not in production.

**The club map is derived, not transcribed.** Its keys are the roster spelling `fixtures`
carries, which for every Competition but the Premier League is football-data.org's long
official name. Both sets — the live source's eighteen team names and the page's own club
section headings — must come out the same size with nothing left over on either side.
**Eighteen, not twenty**, and a reviewer should know that before they read the map.

**The window dates are two frozen dates and a page title per window, not curation**, read
off the page's own lead where it states them. England's, Spain's and Italy's do; France's
does not, and its dates came from the LFP's announcement instead. If Germany's lead is
silent, the DFL's own announcement is the source, and which one was used is written down
beside the dates.

The winter page for a Season does not exist in August. Its title is frozen from the naming
convention the previous editions used and is not verifiable until it is created — the same
standing gap the other four carry.

## Acceptance

- [ ] The two windows are registered with their page titles, their frozen dates, the
      source each date was read from, and a `format` that matches what the page actually
      is.
- [ ] The eighteen-club map is derived from the live source's names against the page's own
      headings, both sets the same size with nothing left over, and is reviewed by a person
      before anything reads it.
- [ ] A real archived snapshot of the page parses into stored rows: arrivals and
      departures both, loans stored as loans, and a null fee where the page states none.
- [ ] If the page needs a fourth format or a widened reader, the shape is added to the
      runbook's §4 alongside the three already there.
