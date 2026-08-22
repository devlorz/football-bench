# Ticket: Italy's and France's transfer pages parse into the packet

**What to build:** the Squad Changes section of the `SA` and `FL1` packets, from each
country's English-Wikipedia transfer list behind curated club maps — with each page's
`format` read off the real page, never guessed. Deliberately off the activation tickets'
blocking path, on spec 0016 ticket 7's precedent: the section may trail into the Season.
Source: [spec 0024](../../specs/0024-serie-a-and-ligue-1-open.md), stories 11–15.
Decisions:
[ADR-0049](../../adr/0049-serie-a-and-ligue-1-open-the-bundesliga-waits-on-hands-not-money.md),
[ADR-0031](../../adr/0031-squad-changes-join-the-match-context-for-2026-27-v2.md),
[ADR-0018](../../adr/0018-raw-signals-only-in-the-entrant-context.md) (never assert a fact
nobody published).

**Blocked by:** 0033 (the club maps key by the live source's spellings, which the
captures carry).

**Status:** done — every box green, the maps approved, and no fetch has stored a row
anywhere: the first one lands with activation.

- [x] Each country's summer window is written down with its page title and its `format`
      determined by reading the real page — `{|` under a heading means wikitable, none
      means club-section — and each winter title frozen from the naming convention,
      marked unverifiable until the page exists.

      _Both pages were fetched before anything was written down. Italy's carries one
      heading with a table under it — `==Transfers==`, one `{|`, one `|}` at line 2485 —
      and France's carries none at all: 72 `{{fs start}}` lists under 36 club headings,
      eighteen of them under `==Ligue 1==` and eighteen under `==Ligue 2==`. So Italy is
      table-shaped and France is Spain's shape, and neither was guessed from the title._

      _**Italy is a third format, not England's.** The runbook said two. Italy publishes
      **one** table where England publishes two, and states its loans in the fee column
      as `Loan` or `6-month loan` where England gives them a table of their own. Its
      table is England's five columns exactly. Written down as `format: "oneTable"`, and
      the runbook now says three._

      _Window dates, each read off a source rather than assumed:_

      | Window | Opens | Closes | `since` | Read off |
      | --- | --- | --- | --- | --- |
      | `italy-summer-2026` | 1 Jul 2026 | 1 Sep 2026 | 2 Feb 2026 | the page's own lead; `since` off the winter 2025-26 page's lead, "2 January to 2 February 2026" |
      | `italy-winter-2026-27` | 2 Jan 2027 | 2 Feb 2027 | 1 Sep 2026 | customary, frozen in August on England's and Spain's terms |
      | `france-summer-2026` | 15 Jun 2026 | 1 Sep 2026 | 2 Feb 2026 | the LFP, below |
      | `france-winter-2026-27` | 1 Jan 2027 | 1 Feb 2027 | 1 Sep 2026 | the LFP, announced |

      _**France's page states no window dates at all** — neither the summer 2026 edition
      nor the winter one before it says when the window it lists opened or shut, where
      England's, Spain's and Italy's all open with a lead that does. The dates are the
      LFP's own announcement instead: "le mercato estival débutera le lundi 15 juin 2026
      et s'achèvera le mardi 1er septembre 2026 à 19h59 … le mercato hivernal commencera
      le vendredi 1er janvier 2027 et se terminera le lundi 1er février 2027"
      (`lfp.fr/article/les-dates-du-mercato-2026-2027`, read 2026-08-21), and `since`
      from the same body's 2025-2026 article, "le mercato hivernal … se clôturera le
      lundi 2 février 2026". France is therefore the one country whose **winter** dates
      are announced rather than customary._

      _The LFP's two announcement pages are **committed** — `lfp-mercato-2026-2027.html.gz`
      and `lfp-mercato-2025-2026.html.gz` — and a test reads the sentences back out of
      them and asserts they are the dates `TRANSFER_WINDOWS` holds. Every other source in
      this pipeline is archived; France's window dates sit inside a frozen sha and were
      the one number no committed file backed, a dead link away from unverifiable.
      Moving the summer open to 10 June or the winter close to 2 February turns that test
      red. **Found by review.**_

      _`format: "oneTable"` is likewise stated rather than remembered: Italy's page opens
      **exactly one** `{|`, closes exactly one `|}`, and carries no `Loans` heading, which
      is the runbook's own test for the shape. **Found by review.**_

      _Both winter titles are frozen from the naming convention with the en dash, and
      both answered **404** on 2026-08-21:_

      ```bash
      for t in "List_of_Italian_football_transfers_winter_2026–27" \
               "List_of_French_football_transfers_winter_2026–27"; do
        curl -s -o /dev/null -w "%{http_code} $t\n" \
          --get --data-urlencode "title=$t" --data "action=raw" \
          https://en.wikipedia.org/w/index.php
      done
      ```

- [x] A page stating no date or fee stores both null, Spain's way; a page stating them
      stores them, England's way; the loan marker reads only the first clause of prose.

      _France stores both null and needed **no parser change at all** — the club-section
      reader wrote for Spain read its 162 moves on the first run, including the bare
      headings and the `{{Fs end}}` spelt with a capital. Its loan marker is the same
      first-clause rule: `to Panathinaikos, previously on loan` is a permanent departure
      and is stored as one, and `on loan to Palermo, previously on loan at Padova` is a
      loan — both pinned._

      _Italy stores what it states, and a loan stores a null fee whichever way its page
      says it is one. `Loan` is not an amount; the render states the loan as its own
      marker and would otherwise say the fee was "loan"._

      _Three things about Italy's page were silent refusals until the reader was widened,
      and each is now pinned by a test that goes red without it:_

      - _the heading `==Transfers==` against England's `== Transfers ==` — matched now,
        not compared, or the page reads as a page with no table on it;_
      - _the date `{{dts|format=dmy|2026|8|2}}` against England's plain `6 February
        2026` — `parseDate` reads both, and a page it cannot date still refuses whole,
        which is unchanged;_
      - _the name `{{Sort|Kolo Muani, Randal|{{flagicon|FRA}} [[Randal Kolo Muani]]}}` —
        the first parameter is the column's sort key and the rest is the row._

- [x] Each league's football-data.org → Wikipedia club map is derived from the captured
      response against the page's own section headings — both sets the same size,
      nothing left over — holding article title and displayed name both.

      _Derived on 2026-08-21 by ticket 6's method, and asserted **both directions** in
      `test/fetch-squad-changes.test.ts`: the map's keys against the recorded response's
      `homeTeam.name` set, and — for France — the map's displayed names against the
      eighteen section headings under `==Ligue 1==`. A count is not a set, so both are
      set equalities and not lengths._

      _**Serie A: nineteen of the twenty are the article title outright** and cannot be
      wrong. The one judgement call is `FC Internazionale Milano` → `Inter Milan`, and
      nothing else on either side carries "Inter" or "Milano" — `AC Milan` is present
      under its own name on both sides, so the two cannot be swapped by misreading one
      source._

      _**Ligue 1: sixteen of the eighteen** are the article title outright. The two that
      are not are `Racing Club de Lens` → `RC Lens` and `Stade Rennais FC 1901` →
      `Stade Rennais FC`, both the page's own link targets. Paris Saint-Germain is
      written both `Paris Saint-Germain FC` and `Paris Saint-Germain F.C.` on the page;
      the first is used five times of six and is what is stored. **The two Paris clubs
      are the only pair that could be confused and they are not**: `Paris FC` and
      `Paris Saint-Germain` head their own sections and share no spelling._

      _**The first version of this proof was one-directional and is replaced.**
      It asked whether every club in the recorded response resolved, which shows the
      roster is a *subset* of the map: a stale twenty-first Serie A entry or nineteenth
      Ligue 1 entry left behind by a relegation resolves nobody, is asked about by
      nothing, and passed. `wikipediaClubsOf` now exposes the map — the shape
      `teamNamesOf` already had — and the test enumerates its keys against the recorded
      roster. **Found by review.**_

      _**Both fields are now compared against the page, as a pair.** Asking whether an
      article appears somewhere is too weak on a page that also lists a second division;
      what the map claims is that *this* article is displayed by *this* name, so the test
      looks for that one link — `[[US Lecce|Lecce]]`, or the unpiped `[[Paris FC]]` — on
      each league's own page. A value carrying one club's article beside another's name
      fails even though both strings are on the page. Neither field may repeat either:
      two clubs sharing an article would resolve the same rows twice, and two sharing a
      displayed name would make a bare heading ambiguous. Serie A's articles are also
      checked against the `Transfers` table alone rather than the whole page.
      **Found by review.**_

      _**Even that pair check admits the wrong club, and the derivation rule is what
      refuses it.** Italy's `Transfers` table lists Serie A and Serie B together, so
      `AC Monza` mapped to `Palermo FC|Palermo` is a link the page really writes, unique
      on both fields, inside the table, leaving the parsed row count at 342 and both
      rendered samples untouched — it passed every check above. What refuses it is the
      rule this map was derived by and this ticket already wrote down: the article is the
      live source's own spelling for all but a named few. Those few are pinned as a
      constant — Serie A's `FC Internazionale Milano` → `Inter Milan`, Ligue 1's
      `Racing Club de Lens` → `RC Lens` and `Stade Rennais FC 1901` →
      `Stade Rennais FC` — so a mapping that wanders fails whether it wanders to a club
      on the page or off it, and dropping a reviewed exception fails too.
      **Found by review.**_

      _Which identity is load bearing differs by page, and the maps hold both: Italy
      links every club, so the **article** resolves there; France heads its sections in
      bare text — `===Lens===` — so the **displayed name** is the whole join, exactly as
      on every Spanish winter edition._

      _**Ligue 1 has eighteen clubs**, and this is the first map in the file that is not
      twenty rows. The runbook now says so where it says "~20"._

- [x] Both maps are reviewed and approved by a person before any fetch stores a row.

      _Presented on 2026-08-21 with the three judgement calls named — Serie A's
      `FC Internazionale Milano` → `Inter Milan`, Ligue 1's `Racing Club de Lens` →
      `RC Lens` and `Stade Rennais FC 1901` → `Stade Rennais FC` — and approved. Every
      other pairing is a straight title match._

      _Re-runnable, and the predicate ADR-0026 lets both frozen shas move on — a
      structural argument for why a row cannot exist is not a query showing that it does
      not:_

      ```sql
      -- the version is what a seat is entered under; `contexts` has no such column
      select prompt_version, count(*) from models
       where prompt_version in ('match-sa/2026-27-v1', 'match-fl1/2026-27-v1')
       group by prompt_version;

      select competition, track, count(*) from contexts
       where competition in ('SA', 'FL1') group by competition, track;

      select competition, count(*) from predictions
       where competition in ('SA', 'FL1') group by competition;

      select competition, count(*) from squad_changes
       where competition in ('SA', 'FL1') group by competition;
      ```

      _**All four returned no rows** on 2026-08-21: no seat is entered under either
      version, neither Competition has ever had a context rendered, no Prediction is
      stored for either, and neither has a Squad Change row. That is ADR-0026's
      "the freeze binds at first use" as a fact rather than as an argument._

      _The first version of this block asked `contexts.prompt_version`, **a column that
      does not exist** — the version lives on `models`, which is the seat. It was written
      from an assumption about the schema rather than read off it, which is the same
      mistake in miniature that asking for the query at all guards against. It failed
      loudly, which is the only reason it is recorded rather than believed.
      **Found by review.**_

      _**No fetch has stored a row, and none can yet.** The daily fetch walks the
      `competitions` rows for the Season, and neither league has one until it is
      activated; `fetchSquadChanges` would in any case find no upcoming Gameweek to
      file the partition under, neither league having a `gameweeks` row. So the first
      Squad Change row for either league lands with 0039/0040, and the approval above
      is what those tickets need to have in hand before it does — which is the order
      the box asks for._

- [x] One test per country carries the whole path — the recorded page, through the
      fetch, into the database, out through the context query, into the rendered
      section — including whichever null-date shape the page turned out to have.

      _`renders a stored Serie A window as the section a packet carries` and its Ligue 1
      twin, both in `test/fetch-squad-changes.test.ts`, on the pattern La Liga's set.
      Serie A's carries dated rows with euro fees; Ligue 1's carries the null date and
      null fee the whole way down, which is what proves the null survives the comparator
      inside the Lock window._

      _Both pages are committed as the bytes `fetch().text()` returned, and each test
      re-checks its digest before reading it:_

      | Fixture | sha256 | chars |
      | --- | --- | --- |
      | `wikipedia-transfers-italy-summer-2026.txt.gz` | `4e252090…` | 171,542 |
      | `wikipedia-transfers-france-summer-2026.txt.gz` | `5fe7caa9…` | 125,467 |

      _The captures were checked byte for byte against a `curl` of the same URL; unlike
      football-data.co.uk's CSVs, neither carries a BOM. Parsed, they hold **342** Serie
      A rows and **162** Ligue 1 rows._

- [x] A fetch for one Competition provably cannot touch another's partition of the same
      Gameweek number.

      _`leaves every other Competition's Gameweek 1 partition untouched` seeds four
      Competitions' Gameweek 1 — `PL`, `PD`, `SA`, `FL1` — puts a row in each of the two
      older partitions, fetches both new leagues, and asserts all four counts. Dropping
      `competition = $1` from the fetch's delete turns eleven tests red._

- [x] Neither frozen sha moves unless a window gate changes a rendering, and if one
      does, the move is recorded the documented way.

      _**Both moved, and this is the gate.** A Competition with no transfer window
      renders no Squad Changes section at all; writing the windows down opens the gate,
      and each packet grows the stated absence "no Squad Change data stored for this
      Gameweek" — the same line the Premier League's and La Liga's pinned renders carry
      over the same empty list. Read before it was written: the four renders' sections
      are identical but for the heading date._

      | Competition | Version | From | To |
      | --- | --- | --- | --- |
      | `SA` | `match-sa/2026-27-v1` | `c82e6850…` | `0f209812…` |
      | `FL1` | `match-fl1/2026-27-v1` | `dabac3c9…` | `ea804697…` |

      _Both versions are v1 and **unused** — unamendable only from their first Lock
      (ADR-0042) — so this is a freeze being corrected, not a used prompt changing. The
      move is recorded in `openrouter-entrant.ts` beside the pins and in
      `openrouter-entrant.test.ts` beside the test, both of which previously recorded
      that the history backfills did **not** move them. The runbook now warns that edit
      6 moves edit 2's sha, which is the one rendering change that arrives from a
      registry rather than from the builder._

## Mutation checks

Each mutation was applied to the source, the file confirmed changed, the suite run, and
the source restored from a byte copy taken before the run — never `git checkout`.

| Mutation | Result |
| --- | --- |
| heading matched with `indexOf("== Transfers ==")` again | 9 red |
| Italy's `loan` read as `() => false` | 4 red |
| a loan stores the fee cell instead of null | 3 red |
| the `{{dts}}` branch of `parseDate` disabled | 8 red |
| the `{{Sort}}` unwrap disabled | 6 red |
| Lens's displayed name changed to `RC Lens` | 7 red |
| Inter's article changed to `Internazionale` | 8 red |
| the fetch's delete unscoped from `competition` | 11 red |
| a map key spelt `Como` instead of `Como 1907` | 10 red |
| Troyes' displayed name changed to `ES Troyes` | 8 red |
| a stale 21st Serie A entry, `Empoli FC` | 1 red — the key set, and only it: the page does write that pair |
| a stale 19th Ligue 1 entry, `Montpellier HSC` | 2 red |
| Lecce's article beside Palermo's name, both on the page | 1 red |
| two Ligue 1 clubs sharing one article | 2 red |
| France's summer open moved to 10 June | 1 red |
| France's winter close moved to 2 February | 1 red |
| `AC Monza` → `Palermo FC\|Palermo`, the reviewer's own case | 1 red |
| `Como 1907` → `Palermo FC\|Palermo` | 1 red |
| `AC Monza` → `Carrarese Calcio 1908\|Carrarese` | 1 red |
| Lens's reviewed exception quietly dropped | 2 red |

## Review

Three findings, all answered above and in the commit that follows this one.

- _Map key equality was one-directional_ — the map is enumerated now, not sampled
  through the roster. **P2.**
- _Both Wikipedia fields were not proved against the real pages_ — the pair is checked
  per league, with uniqueness on each field and Serie A's articles narrowed to the table.
  **P2.**
- _Serie A's pairing was still provable only against a page carrying two divisions_ —
  the article is asserted to be the live source's own spelling, with the reviewed
  exceptions pinned as a constant. **P2, second pass.**
- _"Unused" was prose where 0036 and 0037 set the standard of re-runnable SQL_ — the
  four queries and their zero rows are above; the first draft of them named a column
  that does not exist. **P2, third pass.**
- _The LFP was the one uncommitted source_ — both announcement pages are archived and
  read by a test that pins France's five dates to their sentences. **P2, third pass.**
- _Nothing asserted Italy's page opens one table_ — the evidence `oneTable` stands on is
  stated now. **P2, third pass.**
- _`as unknown as string[]` was a dead cast_ — `noUncheckedIndexedAccess` leaves the
  elements `string | undefined` either way, so the per-element `as string` was doing the
  work; one cast gone. **Ponytail.**
- _Naming and latent nits_ — the format literal is `"twoTables"` beside `"oneTable"`, the
  heading is escaped before it reaches a `RegExp`, and the new comment says Competition
  where its neighbours do. **Nits.**
- _Four country helpers repeated one archived-page reader_ — `pinnedPage(fixture, sha)`
  is that reading and nothing else; every digest and every country's assertions stay
  where they were. **P3.**

## Known and deliberate

`feeAmount` in the context builder reads pounds only, so Serie A's euro fees sort as
"no amount stated" and Juventus's Signings render in date order rather than fee order.
It is deterministic and total, and the fees themselves render verbatim. Fixing it is not
a regex widening: the page writes `€16,4M` with a comma for the decimal point, so a
`,`-stripping parser would read 16.4 million as 164 million. Left alone rather than half
done.
