# Tickets: Shots and xG in the match context

Four tracer-bullet slices that put per-match shots and xG on the last-five form lines and
freeze the result as `match/2026-27-v2` before the Season's first Lock. Source:
[spec 0004](../specs/0004-shots-and-xg-in-the-match-context.md). Vocabulary:
[CONTEXT.md](../../CONTEXT.md). Decisions: [ADR 0001–0017](../adr/), especially
[ADR 0016](../adr/0016-raw-signals-only-in-the-entrant-context.md) and
[ADR 0017](../adr/0017-per-match-shots-and-xg-join-the-context-for-2026-27-v2.md).

Work the **frontier**: the first two tickets are independent and can run in parallel; the
context ticket needs both; the freeze ticket comes last and gates going live.

The hard deadline is the 2026/27 Season's first Gameweek deadline in mid-August. The two
signals are severable: if the Understat ticket threatens the freeze date, shipping v2 with
shots only is an operator decision that keeps the deadline.

---

## Shots ride the existing CSV into the record

**What to build:** Running the fetch stores each historical match with both sides' shots
and shots on target, parsed from the football-data.co.uk CSVs the pipeline already
downloads and archives — for the Premier League and the Championship alike. Seasons whose
CSVs predate the shot columns keep loading, with those fields simply absent.

**Blocked by:** None — can start immediately.

- [x] A migration adds nullable home/away shots and shots-on-target columns to the
      historical-matches table, and the schema tests cover them against real Postgres
- [x] Running the fetch on a CSV that carries `HS`, `AS`, `HST` and `AST` stores all four
      figures on each match row, for both divisions
- [x] A row whose shot columns are absent or blank loads with those fields null — the
      loader never invents zeros and never fails a season for lacking them
- [x] A row whose shot columns are present but malformed fails validation naming the row
      and field, and stores no derived rows
- [x] The raw CSV is archived byte-for-byte exactly as before
- [x] Tests inject canned CSV bodies through the existing outbound-HTTP seam: with shot
      columns, without them, and with a malformed value

---

## Understat xG fetched, stored, and survivable

**What to build:** The daily fetch pulls per-match xG for finished Premier League matches
from Understat's internal JSON endpoints into a new xG table, archiving every raw response
and failing loudly at the boundary — and a one-off backfill command ingests the prior
season so the form window that crosses the season boundary is covered from Gameweek 1. An
Understat outage degrades: the rest of the fetch proceeds and the failure is loudly logged,
because an enrichment source is never allowed to block the write path.

**Blocked by:** None — can start immediately.

- [x] A migration creates the xG table keyed by season and Understat match id, carrying
      kick-off time, both team names as Understat spells them, and both xG values — with
      deliberately no foreign key to historical matches, since a missing xG row is a
      legitimate state
- [x] The fetcher calls the internal JSON endpoints with the headers the reference guide
      documents as required, through the same injectable outbound-HTTP seam as every other
      source, ~~rate-limited between requests~~
- [x] Every raw response is archived exactly as received before any parsing
- [x] String-typed xG values are parsed to numbers at the boundary; matches without an xG
      field (not yet played) are skipped, never stored as zero
- [x] A response with an unexpected shape is archived, then fails validation naming every
      offending field, and stores no derived rows
- [x] Understat team names resolve through an explicit alias mapping; an unmapped name is a
      validation error, never a silent skip
- [x] A failed Understat fetch leaves the daily fetch alive and the stored xG untouched,
      and the failure is loudly logged; the football-data staleness guard still blocks as
      before
- [x] Re-running the fetch does not duplicate stored xG rows
- [x] A backfill command ingests the prior season's xG once; deeper history is not fetched
- [x] Tests replay canned Understat JSON through the HTTP seam: a healthy body, a reshaped
      body, an unknown team name, and an outage that the run survives

**Rate limiting struck, not skipped.** The criterion assumed the reference implementation's
per-team fetching (20 requests a season). Using `getLeagueData` instead, a whole Season's xG
is one request, so the daily fetch makes exactly one call to Understat per run and the
backfill makes one more, once. There is no gap between requests for a delay to occupy, and
speculative pacing machinery would be untested code. Revisit only if a future ticket
introduces a per-team or per-match loop.

**Two alias spellings are unverified, and the fetch now checks them.** `Coventry` and `Hull`
in `src/understat/team-identity.ts` are guesses: neither club appears in the Understat
Premier League seasons the guide covers, so their exact titles could not be confirmed
offline.

They were originally unconfirmable before the Season started. A match with no `xG` field was
skipped *before* the name check, and no match has an `xG` field until it has been played — so
the alias mapping was first exercised in the fetch following GW1, which is after the freeze.

**Resolved during the freeze ticket** (operator decision): the alias check moved ahead of the
not-yet-played skip. Upcoming matches already carry `h.title` / `a.title`, so a pre-season
fetch now resolves every name in the feed and fails loudly on a rename while there is still
no stored xG to lose. This is the second of the two options weighed here, chosen over grepping
the archived `raw_snapshots` body by hand because it makes the check standing rather than
one-off. It alters behaviour outside this ticket's wording, and is recorded as a deliberate
addition rather than a silent one.

The blast radius is unchanged: one unmapped name still fails validation for the whole body,
so no xG rows are stored at all, and *every* team's form lines read `xG unavailable`, not
just the misspelled club's. Loud and recoverable by editing the mapping, but wider than it
looks. What changed is *when* it surfaces — a pre-season fetch rather than the first fetch
after opening day.

---

## Form lines carry shots and xG

**What to build:** The context's last-five form lines carry both sides' shots, shots on
target, and per-match xG, in the decided format — and a match with no xG row says
`xG unavailable` explicitly, whether the gap comes from a promoted side's Championship
history, the early-season window, or an outage. Everything else in the context is
byte-identical to before: no aggregates, score-only head-to-head, unchanged FPL section.

**Blocked by:** Shots ride the existing CSV into the record · Understat xG fetched,
stored, and survivable.

- [x] The context loader joins xG to historical matches by date and alias-resolved team
      names, and carries the shot columns through to the builder
- [x] A form line for a match with full data reads like
      `W 2-1 v Chelsea (H) — shots 15-8, on target 7-3, xG 2.10-0.85`, both sides'
      numbers ordered ~~this-team-first~~ home-team-first per the existing line convention
- [x] A form line for a match with no xG row ends `xG unavailable`; every kind of gap
      renders identically
- [x] A form line for a match with no shot data omits the shot segment rather than
      printing zeros
- [x] No season-aggregate shots or xG appear anywhere; the head-to-head section stays
      score-only; the FPL player section and prompt envelope are untouched
- [x] All matches feeding the lines remain strictly before the Gameweek's deadline
- [x] Pure-builder tests assert the emitted strings exactly, in the pattern of the
      existing historical-context tests

**The segments are appended, not a new line format.** The criterion's example
(`W 2-1 v Chelsea (H) — …`) is the format from the grilling session, which the spec marks
illustrative. The real line has always been
`- 2025-26 Premier League | 2026-05-01 | Arsenal 3-1 Everton | W`, so the signals ride it as
a further pipe-delimited segment rather than replacing a format nothing else in the repo
uses:

```
- 2025-26 Premier League | 2026-05-01 | Arsenal 3-1 Nott'm Forest | W | shots 15-8, on target 7-3, xG 2.10-0.85
- 2025-26 Championship | 2026-05-02 | Coventry 2-0 Hull | W | shots 19-6, on target 8-2, xG unavailable
```

**Home-team-first, not this-team-first** (operator decision, this session). The criterion's
wording assumed its own team-first example, where score and shots agree. On the real line the
score is home-first, so this-team-first would print `Fulham 0-2 Arsenal | … shots 15-8` with
the score and the shots counting from opposite ends of the same line. Home-first keeps every
number on the line reading in the same direction as the scoreline beside it.

**The xG join is date + alias, with no fallback.** `understat_match_xg` keeps Understat's
spelling and a real kick-off instant; stored results keep football-data's spelling and the
match date at midnight. The loader resolves the Understat name through
`src/understat/team-identity.ts` and keys on the UTC date. An xG row that matches nothing —
rescheduled fixture, renamed club — leaves the line reading `xG unavailable`, the same
explicit gap a promoted side's Championship history produces. Silence is never filled with a
neighbouring match's number.

**The xG query is bounded by the deadline too, and that is load-bearing.** Stored results
carry midnight, so a same-day Match kicking off *after* the deadline can still sit inside
`played_on < deadline`. Its xG row carries the true kick-off instant, so without
`kicked_off_at < deadline` a post-deadline xG could reach a form line through a match the
existing filter already lets through. Removing the clause turns
`test/predict-gameweek.test.ts`'s post-deadline test red — verified, not assumed.

---

## Freeze match/2026-27-v2 and re-run pre-flight

**What to build:** The enriched context ships as a new frozen pair: the Prompt Version
becomes `match/2026-27-v2` with a recomputed hash, every Entrant points at it, and
pre-flight runs against contexts that look like the real opening-day article — prior-season
xG in place, promoted sides showing their explicit gaps. The v1 constant and every
rehearsal artifact recorded under it stay intact and attributable.

**Blocked by:** Understat xG fetched, stored, and survivable · Form lines carry shots and
xG.

- [x] The prompt-version constant reads `match/2026-27-v2` and its stored hash matches the
      new template bytes; the version-match assertion still refuses a mismatched Entrant
      — **landed early, with the form-lines ticket** (see note below)
- [ ] All nine Entrant rows point at the new Prompt Version before the Season's first Lock
      — **operator-run SQL, recorded below; not yet run**
- [x] Contexts are stored and hashed under v2 exactly as under v1, and Fill runs reuse the
      stored bytes verbatim
- [x] Rehearsal contexts and attempts recorded under v1 remain in the record, attributable
      to v1
- [ ] Pre-flight is re-run against the enriched context for every Entrant and its verdict
      recorded, with the prior season's xG ingested first so the contexts match opening
      day — **operator-run; needs the live database, the network and API keys**
- [x] No digested forecast — odds, Elo, strength ratings, lambdas — appears anywhere in
      the emitted context

**Why the version bump came early** (operator decision, this session). Enriching the form
lines changes the emitted bytes, so the frozen-checksum guard in
`test/openrouter-entrant.test.ts` went red the moment the form-lines ticket was green. Three
ways out, and only one keeps v1 meaning what it means: recomputing v1's hash in place would
silently redefine the Prompt Version and leave the rehearsal attempts already recorded under
it attributable to bytes no Entrant ever saw. So the constant pair moved to
`match/2026-27-v2` here rather than leaving a known-red suite between tickets. The hash it
carried then (`29e81593…`) was recomputed once more when the pinned fixture was enriched
below; the frozen value is `7b5d0bc1…`.

**What that costs until the rest of this ticket lands.** `MATCH_PROMPT_VERSION` now reads
v2 while the nine Entrant rows in the database still read v1, so `predictGameweek` and
pre-flight both refuse with a version mismatch. That is the version-match assertion working,
not a regression — but **no real prediction or pre-flight run will succeed until the Entrant
rows are re-pointed** by the criterion below. Test-side Entrant fixtures were moved to v2
with the constant. The v1 literals left in `test/dry-run-archive.test.ts` and
`test/expected-dry-run-outcome.test.ts` are deliberate: those stand for rehearsal artifacts,
which the spec requires stay attributable to v1.

**The pinned fixture now exercises the new segments** (operator decision, freeze ticket).
It previously built from matches carrying no shots and no xG, so every form line in the
pinned bytes read `xG unavailable`: the hash pinned the template and the builder's overall
shape, but a bug in the shots or xG formatting specifically would not have moved it.

The four fixture matches now span every way a form line can render — both signals present;
both present with the subject team away, pinning the home-team-first ordering against the
scoreline beside it; shots without xG, the ordinary Championship case; and neither signal, so
the dropped-not-zeroed shot segment stays pinned too. The hash was recomputed once more
against the reviewed bytes, and the freeze lands with the fixture and
`MATCH_PROMPT_SHA256` agreeing.

**What the three ticked criteria rest on.** None of them needed new code; all three were
confirmed against the suite and the source rather than assumed.

*Contexts stored and hashed under v2, Fill reuses the bytes verbatim.* The storage path is
version-agnostic by construction — `contexts` is keyed by season, Gameweek, Track and Fixture
with a hash of the body (`predict-gameweek.ts:92-96`), and carries no Prompt Version column at
all. The version-match assertion gates entry to the run rather than the write, so v2 stores
exactly as v1 did. `test/predict-gameweek.test.ts` seeds Entrants at `match/2026-27-v2` and
covers all three behaviours: the context is stored before the Lock, a Fill refuses to rebuild
a missing one, and a Manual fill sends the stored bytes unaltered —
`expect(prompt).toBe("Stored main-run context.")`, a byte-equality assertion, not a shape one.

*v1 rehearsal artifacts stay attributable.* No code path writes `prompt_version` to a live
`models` row: `predict-gameweek.ts` and `preflight-base-models.ts` only select it, and the
sole insert is `src/dry-run/prepare-archived-gameweek.ts` against a throwaway database. The
v1 literals in `test/dry-run-archive.test.ts`, `test/expected-dry-run-outcome.test.ts` and
`test/fetch-fpl-gameweek.test.ts` are intact, and the re-point SQL below touches `models`
only — never `contexts`, `predictions` or `attempts`.

*No digested forecast.* Read directly off the emitted bytes for the pinned fixture, not
inferred: the context carries scorelines, tables, splits, raw per-match shots and xG, and the
FPL section. A search of `src/` for odds, Elo, strength ratings, lambdas and Poisson returns
only substring false positives (`beforeLock`, `below`, `belong`). `docs/understat/understatService.ts`
does carry a `getMatchLambdas`, which is exactly what ADR 0016 forbids — it is vendored
reference material, outside the `tsconfig` include and imported nowhere.

**Re-pointing the Entrant rows is operator-run SQL, not code** (operator decision, this
session). Nothing in `src/cli/` or `migrations/` seeds or updates the live `models` rows —
the only `insert into models` in `src/` is `src/dry-run/prepare-archived-gameweek.ts`, which
is dry-run scaffolding against a throwaway database. A migration was considered and rejected:
this is a data change, not a schema change, and it would put a one-time Season event into
schema history. Run against the live database, in order:

```sql
-- 1. Before. Expect nine entrant rows on match/2026-27-v1.
select prompt_version, role, count(*)
  from models group by 1, 2 order by 1, 2;

-- 2. Re-point. Scoped to entrants on v1 so it is idempotent and cannot touch
--    a reference row or a row already moved.
begin;
update models
   set prompt_version = 'match/2026-27-v2'
 where role = 'entrant'
   and prompt_version = 'match/2026-27-v1';
-- Expect exactly: UPDATE 9. Anything else, rollback and investigate.
commit;

-- 3. After. Expect nine entrant rows on match/2026-27-v2 and none on v1.
select prompt_version, role, count(*)
  from models group by 1, 2 order by 1, 2;
```

This is the step that makes the system functional again: until it runs, `predictGameweek`
and pre-flight both refuse with a version mismatch. It does not touch `contexts`,
`predictions` or `attempts`, so every rehearsal artifact recorded under v1 stays in the
record and stays attributable to v1.

---
