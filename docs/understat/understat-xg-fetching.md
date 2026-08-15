# Understat xG Data Fetching Guide

> **Reference implementation:** [`understatService.ts`](./understatService.ts)

Understat has **no official public API**. All data is fetched by scraping embedded JSON from their HTML pages, or by hitting undocumented internal API endpoints that Understat's own frontend uses.

---

## 1. How Understat Stores Data

When you load a page like `https://understat.com/league/EPL/2024`, the server renders the full HTML and inlines the data as JavaScript variables inside `<script>` tags:

```html
<script>
  var datesData = JSON.parse('...[escaped JSON]...');
  var teamsData = JSON.parse('...[escaped JSON]...');
  var playersData = JSON.parse('...[escaped JSON]...');
</script>
```

The JSON is **hex/unicode-escaped** (e.g., `\x22` for `"`, `\u0022` for `"`), so it must be decoded before parsing.

This project uses **two methods** to retrieve data:

| Method | Endpoint | Used For |
|---|---|---|
| **Internal API** (preferred) | `/getLeagueData/:league/:season` | League match list |
| **Internal API** (preferred) | `/getTeamData/:team/:season` | Team match history |
| **HTML scraping** (fallback) | `/league/:league/:season` | When API fails |

---

## 2. URL Structure

```
# League page (HTML)
https://understat.com/league/EPL/2024

# Internal JSON API — league
https://understat.com/getLeagueData/EPL/2024

# Internal JSON API — team
https://understat.com/getTeamData/Manchester_City/2024

# Team HTML page
https://understat.com/team/Manchester_City/2024

# Match detail
https://understat.com/match/24589

# Player detail
https://understat.com/player/618
```

**Supported league identifiers:**

| League | Identifier |
|---|---|
| English Premier League | `EPL` |
| La Liga | `La_liga` |
| Bundesliga | `Bundesliga` |
| Serie A | `Serie_A` |
| Ligue 1 | `Ligue_1` |
| Russian Premier | `RFPL` |

---

## 3. Core Implementation

### 3.1 Fetching Raw HTML

```typescript
// src/lib/understatService.ts
async function fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
        cache: 'no-store',
        headers: {
            'User-Agent': 'Mozilla/5.0',
        },
    });
    if (!res.ok) {
        throw new Error(`Understat HTTP ${res.status} ${url}`);
    }
    return res.text();
}
```

A `User-Agent` header is required — Understat blocks requests without it.

---

### 3.2 Decoding the Embedded JSON

Understat escapes its JSON with `\xNN` hex sequences and `\uNNNN` unicode escapes. The project decodes this before `JSON.parse`:

```typescript
// src/lib/understatService.ts
function decodeUnderstatJson(raw: string): string {
    return raw
        .replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) =>
            String.fromCharCode(parseInt(h, 16))
        )
        .replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) =>
            String.fromCharCode(parseInt(h, 16))
        )
        .replace(/\\\\/g, '\\')
        .replace(/\\'/g, "'");
}
```

Then variables are extracted with a regex:

```typescript
function extractUnderstatVar(html: string, varName: string): unknown {
    const re = new RegExp(
        `${varName}\\s*=\\s*JSON\\.parse\\('(.*?)'\\)`,
        's'
    );
    const match = html.match(re);
    if (!match) throw new Error(`${varName} not found in HTML`);
    return JSON.parse(decodeUnderstatJson(match[1]));
}
```

---

### 3.3 Internal API Endpoints (Preferred)

Rather than scraping HTML, the project calls Understat's own internal AJAX endpoints directly. This is faster and returns clean JSON with no decoding needed:

```typescript
// src/lib/understatService.ts — fetchLeagueMatches()
const apiUrl = `https://understat.com/getLeagueData/${league}/${season}`;
const leagueUrl = `https://understat.com/league/${league}/${season}`;

const response = await fetch(apiUrl, {
    cache: 'no-store',
    headers: {
        'User-Agent': 'Mozilla/5.0',
        'X-Requested-With': 'XMLHttpRequest',  // Required to get JSON response
        'Referer': leagueUrl,                  // Must match the league page
        'Accept': 'application/json',
    },
});
```

> **Critical:** `X-Requested-With: XMLHttpRequest` tells Understat's server this is an AJAX request, causing it to return JSON instead of a full HTML page.

---

## 4. Raw API Response Shape

The `/getLeagueData` and `/getTeamData` endpoints return an object keyed by:

```typescript
{
  dates: UnderstatDatesEntry[],   // Match list
  teams: { ... },                 // Team summary stats
  players: { ... }                // Player summary stats
}
```

Each entry in `dates` looks like:

```typescript
type UnderstatDatesEntry = {
    id: string;          // Match ID, e.g. "24589"
    datetime: string;    // "2024-08-17 12:30:00" (UTC, but no Z)
    h: {
        title?: string;       // "Manchester City"
        short_title?: string; // "MCI"
        id?: string;          // "83"
    };
    a: {
        title?: string;
        short_title?: string;
        id?: string;
    };
    xG?: {
        h?: string;  // "2.31" – xG for home team, string not number
        a?: string;  // "0.78"
    };
    goals?: {
        h?: string;  // "3"
        a?: string;  // "1"
    };
    isResult?: boolean; // true = finished, false/undefined = upcoming
};
```

> **Note:** `xG` is only present if the match is **finished**. Upcoming matches have no `xG` field.

---

## 5. Normalising to `Match[]`

The raw API response is normalised into the project's `Match` type:

```typescript
// src/lib/understatService.ts — fetchLeagueMatches()
const matches: Match[] = datesData.map((rawMatch) => ({
    matchId:    rawMatch.id || `${rawMatch.h?.id}_${rawMatch.a?.id}`,
    homeTeam:   rawMatch.h?.title || rawMatch.h?.short_title || '',
    awayTeam:   rawMatch.a?.title || rawMatch.a?.short_title || '',
    kickoff:    toUtcIso(rawMatch.datetime),   // Always forces UTC Z suffix
    season,
    league,
    xG_home:    rawMatch.xG?.h ? parseFloat(rawMatch.xG.h) : undefined,
    xG_away:    rawMatch.xG?.a ? parseFloat(rawMatch.xG.a) : undefined,
    goals_home: rawMatch.goals?.h ? parseInt(rawMatch.goals.h) : undefined,
    goals_away: rawMatch.goals?.a ? parseInt(rawMatch.goals.a) : undefined,
    status:     rawMatch.isResult ? 'finished' : 'upcoming',
}));
```

**Datetime quirk:** Understat returns `"2024-08-17 12:30:00"` without a timezone. The `toUtcIso` helper converts this to `"2024-08-17T12:30:00Z"` (UTC):

```typescript
function toUtcIso(dateTime: string): string {
    if (!dateTime) return new Date().toISOString();
    const isoLike = dateTime.includes('T')
        ? dateTime
        : dateTime.replace(' ', 'T');
    return isoLike.endsWith('Z') ? isoLike : `${isoLike}Z`;
}
```

---

## 6. Fetching by Entity

### 6.1 League Matches

Returns all matches (finished + upcoming) for a league/season:

```typescript
import { fetchLeagueMatches } from '@/lib/understatService';

const matches = await fetchLeagueMatches('EPL', '2024');
// Returns Match[] — finished matches include xG_home / xG_away
```

### 6.2 Team Matches

Returns a team's full fixture list for a season. Team name must use underscores:

```typescript
import { fetchTeamMatches } from '@/lib/understatService';

const matches = await fetchTeamMatches('Manchester_City', '2024', 'EPL');
```

> Team name aliases (display name → Understat slug) are handled by `getUnderstatName` in [`src/data/teamAliases.ts`](../src/data/teamAliases.ts):
>
> ```typescript
> import { getUnderstatName } from '@/data/teamAliases';
> const slug = getUnderstatName('Man City'); // → "Manchester_City"
> ```

### 6.3 Match Lambdas (xG-based goal expectations)

Combines home/away team rolling xG stats to produce `λ_home` and `λ_away`:

```typescript
import { getMatchLambdas } from '@/lib/understatService';

const result = await getMatchLambdas('Arsenal', 'Chelsea', '2024', 8, 'EPL');
// {
//   lambda_home: 1.82,
//   lambda_away: 1.21,
//   breakdown: {
//     home_attack: 1.95, home_def: 1.08,
//     away_attack: 0.98, away_def: 1.69,
//   }
// }
```

**Formula:**
```
λ_home = (home_attack + away_def_of_opponent) / 2
λ_away = (away_attack_of_opponent + home_def) / 2
```

---

## 7. Rolling xG Stats

`calculateTeamStats` computes rolling averages over the last N finished matches (default window = 8):

```typescript
import { calculateTeamStats } from '@/lib/understatService';

const stats = calculateTeamStats('Arsenal', matches, 8);
// {
//   team: 'Arsenal',
//   homeAttack: 1.95,   // avg xG scored at home (last 8 home games)
//   homeDef:    1.08,   // avg xG conceded at home
//   awayAttack: 1.72,   // avg xG scored away
//   awayDef:    1.31,   // avg xG conceded away
//   matchesHome: 8,
//   matchesAway: 6,
//   window: 8
// }
```

**Fallback values** when a team has fewer than 1 game in a venue category:

| Metric | Fallback |
|---|---|
| `homeAttack` | `1.5` (league avg) |
| `homeDef` | `1.3` |
| `awayAttack` | `1.3` |
| `awayDef` | `1.5` |

---

## 8. Caching

All fetches are cached in **memory** (a `Map`) with adaptive TTL:

```typescript
// src/lib/understatService.ts
const CACHE_TTL_FINISHED_MS = 24 * 60 * 60 * 1000;  // 24 hours
const CACHE_TTL_UPCOMING_MS =  1 * 60 * 60 * 1000;  //  1 hour
```

**Cache key format:**

| Data | Key |
|---|---|
| League matches | `matches:EPL:2024` |
| Team matches | `team:Manchester_City:2024:EPL` |

**Adaptive TTL logic:** If any match in the response has `status !== 'finished'`, the entire result set is cached for only 1 hour (so live/upcoming data stays fresh). Pure historical data gets 24 hours.

**Cache management:**

```typescript
import { clearCache, clearCacheByPattern, getCacheStats } from '@/lib/understatService';

clearCache();                      // Clears everything
clearCacheByPattern('EPL:2025');   // Clears only EPL 2025 entries — returns count cleared
getCacheStats();                   // { entries: 3, keys: ['matches:EPL:2024', ...] }
```

---

## 9. Bulk Ingestion (Calibration Pipeline)

The script [`scripts/00_ingest_understat.ts`](../scripts/00_ingest_understat.ts) bulk-ingests multiple seasons and saves to a JSONL file:

```bash
# Defaults to EPL
npm run calibrate:ingest

# Specific league
npm run calibrate:ingest -- --league=Bundesliga
```

**What it does:**
1. Iterates over seasons `['2023', '2024', '2025', '2026']`
2. Calls `fetchLeagueMatches()` for each
3. Filters out matches without `xG` data (i.e., upcoming matches)
4. Rate-limits at **500 ms between requests**
5. Keeps the most recent **800 matches**
6. Outputs to `data/matches_{league}.jsonl`

```typescript
// scripts/00_ingest_understat.ts
const SEASONS = ['2023', '2024', '2025', '2026'];
const DELAY_MS = 500; // Rate limiting

for (const season of SEASONS) {
    const matches = await fetchLeagueMatches(LEAGUE, season);
    // filter → push to allMatches
    await sleep(DELAY_MS);
}
```

---

## 10. Debugging the HTML Structure

If the internal API starts failing, use the debug script to inspect what Understat's HTML currently contains:

```bash
npx tsx scripts/debug-understat.ts
```

It looks for the key JS variable names in the raw HTML:

```typescript
// scripts/debug-understat.ts
const datesDataIndex  = html.indexOf('datesData');
const teamsDataIndex  = html.indexOf('teamsData');
const jsonParseIndex  = html.indexOf('JSON.parse');
const atobIndex       = html.indexOf('atob');  // Check if encoding changed
```

---

## 11. Testing

Tests are in [`src/lib/__tests__/`](../src/lib/__tests__/) and mock `global.fetch`.

**Cache tests** ([`understatService.cache.test.ts`](../src/lib/__tests__/understatService.cache.test.ts)):
- Verifies `clearCache()` empties all entries
- Verifies `clearCacheByPattern('EPL:2025')` only removes matching keys
- Verifies `getCacheStats()` reports accurate key counts

**Timezone / TTL tests** ([`understatService.timezone.test.ts`](../src/lib/__tests__/understatService.timezone.test.ts)):
- Verifies all timestamps get the `Z` UTC suffix appended
- Verifies finished matches are cached for **24 hours** (second call skips fetch)
- Verifies upcoming matches are cached for **1 hour** (fetch after 61 min)
- Verifies mixed result sets use the shorter **1-hour TTL**

Run:
```bash
npx vitest run src/lib/__tests__/understatService
```

---

## 12. Quick Smoke Test

```bash
npx tsx scripts/test-understat.ts
```

Tests three things end-to-end:
1. `fetchLeagueMatches('EPL', '2024')` — logs first match + xG
2. `fetchTeamMatches('Manchester_City', '2024')` — logs first team match
3. `getMatchLambdas(homeTeam, awayTeam, '2024', 8)` — logs λ breakdown for the first upcoming match

---

## 13. Key Gotchas

| Issue | Detail |
|---|---|
| **`xG` is a string, not a number** | Always `parseFloat(rawMatch.xG.h)` before using |
| **No `xG` for upcoming matches** | Field is absent; normalised as `undefined`, not `0` |
| **Team names use underscores** | `Manchester_City`, not `Manchester City`. Use `getUnderstatName()` to convert display names |
| **Datetime has no timezone** | `toUtcIso()` appends `Z` — Understat timestamps are UTC |
| **404 on future seasons** | `fetchTeamMatches` handles 404 gracefully and returns `[]` |
| **Rate-limiting** | Use 500 ms delay between requests in bulk scripts; in-memory cache prevents re-fetching |
| **`User-Agent` required** | Requests without it are blocked |
| **`X-Requested-With` required** | Omitting it makes the server return full HTML instead of JSON |
