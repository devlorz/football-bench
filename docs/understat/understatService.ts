/**
 * Understat Service - xG Data Fetching and Caching
 * 
 * This service handles:
 * 1. Fetching xG data from Understat (via HTTP requests and JSON extraction)
 * 2. Caching with TTL (6-12 hours recommended)
 * 3. Computing rolling averages for team stats
 * 4. Calculating lambda values for upcoming matches
 * 
 * IMPORTANT: Understat does not have an official API.
 * This fetches embedded JSON data from their web pages via HTTP.
 * Rate limiting and caching are essential.
 */

import type { Match, TeamStats, LambdaResult, CacheEntry, SupportedLeague } from '@/types';

// ============ CACHE CONFIGURATION ============

// Adaptive TTL based on match status
const CACHE_TTL_FINISHED_MS = 24 * 60 * 60 * 1000; // 24 hours for finished matches
const CACHE_TTL_UPCOMING_MS = 1 * 60 * 60 * 1000;   // 1 hour for upcoming matches
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours (legacy default)
const cache: Map<string, CacheEntry<unknown>> = new Map();

function getCached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
        cache.delete(key);
        return null;
    }

    return entry.data as T;
}

function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL_MS): void {
    cache.set(key, {
        data,
        timestamp: Date.now(),
        ttl,
    });
}

// ============ UNDERSTAT DATA FETCHING ============

const UNDERSTAT_BASE_URL = 'https://understat.com';

type UnderstatTeamRef = {
    title?: string;
    short_title?: string;
    id?: string;
};

type UnderstatDatesEntry = {
    id: string;
    datetime: string;
    h: UnderstatTeamRef;
    a: UnderstatTeamRef;
    side?: 'h' | 'a';
    xG?: { h?: string; a?: string };
    goals?: { h?: string; a?: string };
    isResult?: boolean;
};

/**
 * Convert Understat datetime to UTC ISO string
 */
function toUtcIso(dateTime: string): string {
    if (!dateTime) return new Date().toISOString();
    const isoLike = dateTime.includes('T')
        ? dateTime
        : dateTime.replace(' ', 'T');
    return isoLike.endsWith('Z') ? isoLike : `${isoLike}Z`;
}

/**
 * Fetch league fixtures/matches from Understat using API endpoint
 * Falls back to HTML parsing if API fails
 * 
 * @param league - League identifier (e.g., 'EPL')
 * @param season - Season year (e.g., '2024')
 */
export async function fetchLeagueMatches(
    league: string = 'EPL',
    season: string = '2024'
): Promise<Match[]> {
    const cacheKey = `matches:${league}:${season}`;
    const cached = getCached<Match[]>(cacheKey);
    if (cached) return cached;

    try {
        // Try API endpoint first
        const apiUrl = `${UNDERSTAT_BASE_URL}/getLeagueData/${league}/${season}`;
        const leagueUrl = `${UNDERSTAT_BASE_URL}/league/${league}/${season}`;

        const response = await fetch(apiUrl, {
            cache: 'no-store',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': leagueUrl,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json() as {
            dates?: UnderstatDatesEntry[];
            teams?: unknown;
            players?: unknown;
        };

        const datesData = data.dates || [];

        if (!Array.isArray(datesData) || datesData.length === 0) {
            console.warn(`No dates data found for ${league} ${season}`);
            return [];
        }

        // Normalize to Match[] format
        const matches: Match[] = datesData.map((rawMatch) => ({
            matchId: rawMatch.id || `${rawMatch.h?.id}_${rawMatch.a?.id}`,
            homeTeam: rawMatch.h?.title || rawMatch.h?.short_title || '',
            awayTeam: rawMatch.a?.title || rawMatch.a?.short_title || '',
            kickoff: toUtcIso(rawMatch.datetime),
            season,
            league,
            xG_home: rawMatch.xG?.h ? parseFloat(rawMatch.xG.h) : undefined,
            xG_away: rawMatch.xG?.a ? parseFloat(rawMatch.xG.a) : undefined,
            goals_home: rawMatch.goals?.h ? parseInt(rawMatch.goals.h) : undefined,
            goals_away: rawMatch.goals?.a ? parseInt(rawMatch.goals.a) : undefined,
            status: rawMatch.isResult ? 'finished' : 'upcoming',
        }));

        // Adaptive caching: use shorter TTL if any matches are upcoming/in-progress
        const hasUpcomingMatches = matches.some(m => m.status !== 'finished');
        const ttl = hasUpcomingMatches ? CACHE_TTL_UPCOMING_MS : CACHE_TTL_FINISHED_MS;

        setCache(cacheKey, matches, ttl);
        return matches;
    } catch (error) {
        console.error(`Error fetching league matches for ${league} ${season}:`, error);
        return [];
    }
}

/**
 * Fetch team match history with xG data using HTTP requests
 * 
 * @param team - Team name with underscores (e.g., 'Manchester_City')
 * @param season - Season year
 */
export async function fetchTeamMatches(
    team: string,
    season: string = '2024',
    league: SupportedLeague = 'EPL'
): Promise<Match[]> {
    const cacheKey = `team:${team}:${season}:${league}`;
    const cached = getCached<Match[]>(cacheKey);
    if (cached) return cached;

    try {
        // Team URLs use underscores, so convert spaces to underscores
        const teamSlug = team.replace(/\s+/g, '_');
        const apiUrl = `${UNDERSTAT_BASE_URL}/getTeamData/${teamSlug}/${season}`;
        const teamUrl = `${UNDERSTAT_BASE_URL}/team/${teamSlug}/${season}`;

        const response = await fetch(apiUrl, {
            cache: 'no-store',
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': teamUrl,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            // Handle 404 gracefully - season data might not be available yet
            if (response.status === 404) {
                console.warn(`No data available for ${team} ${season} (${league})`);
                return [];
            }
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json() as {
            dates?: UnderstatDatesEntry[];
            matches?: unknown;
        };

        const datesData = data.dates || [];

        if (!Array.isArray(datesData) || datesData.length === 0) {
            console.warn(`No dates data found for ${team} ${season}`);
            return [];
        }

        // Normalize to Match[] format
        const matches: Match[] = datesData.map((rawMatch) => ({
            matchId: rawMatch.id || `${rawMatch.h?.id}_${rawMatch.a?.id}`,
            homeTeam: rawMatch.h?.title || rawMatch.h?.short_title || '',
            awayTeam: rawMatch.a?.title || rawMatch.a?.short_title || '',
            kickoff: toUtcIso(rawMatch.datetime),
            season,
            league,
            xG_home: rawMatch.xG?.h ? parseFloat(rawMatch.xG.h) : undefined,
            xG_away: rawMatch.xG?.a ? parseFloat(rawMatch.xG.a) : undefined,
            goals_home: rawMatch.goals?.h ? parseInt(rawMatch.goals.h) : undefined,
            goals_away: rawMatch.goals?.a ? parseInt(rawMatch.goals.a) : undefined,
            status: rawMatch.isResult ? 'finished' : 'upcoming',
        }));

        // Adaptive caching: use shorter TTL if any matches are upcoming/in-progress
        const hasUpcomingMatches = matches.some(m => m.status !== 'finished');
        const ttl = hasUpcomingMatches ? CACHE_TTL_UPCOMING_MS : CACHE_TTL_FINISHED_MS;

        setCache(cacheKey, matches, ttl);
        return matches;
    } catch (error) {
        console.error(`Error fetching team matches for ${team} ${season}:`, error);
        return [];
    }
}

/**
 * Calculate rolling team statistics
 * 
 * @param team - Team name
 * @param matches - Array of matches for this team
 * @param window - Rolling window size (default 8)
 */
export function calculateTeamStats(
    team: string,
    matches: Match[],
    window: number = 8
): TeamStats {
    // Filter finished matches and sort by date (newest first)
    const finished = matches
        .filter(m => m.status === 'finished' && m.xG_home !== undefined)
        .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime());

    // Separate home and away games
    const homeGames = finished.filter(m => m.homeTeam === team).slice(0, window);
    const awayGames = finished.filter(m => m.awayTeam === team).slice(0, window);

    // Calculate averages
    const homeAttack = homeGames.length > 0
        ? homeGames.reduce((sum, m) => sum + (m.xG_home || 0), 0) / homeGames.length
        : 1.5; // League average fallback

    const homeDef = homeGames.length > 0
        ? homeGames.reduce((sum, m) => sum + (m.xG_away || 0), 0) / homeGames.length
        : 1.3;

    const awayAttack = awayGames.length > 0
        ? awayGames.reduce((sum, m) => sum + (m.xG_away || 0), 0) / awayGames.length
        : 1.3;

    const awayDef = awayGames.length > 0
        ? awayGames.reduce((sum, m) => sum + (m.xG_home || 0), 0) / awayGames.length
        : 1.5;

    return {
        team,
        season: matches[0]?.season || '2024',
        homeAttack,
        homeDef,
        awayAttack,
        awayDef,
        matchesHome: homeGames.length,
        matchesAway: awayGames.length,
        window,
    };
}

/**
 * Get lambda values for a specific match
 * Combines home team attack/defense with away team attack/defense
 */
export async function getMatchLambdas(
    homeTeam: string,
    awayTeam: string,
    season: string = '2024',
    window: number = 8,
    league: SupportedLeague = 'EPL'
): Promise<LambdaResult> {
    // Import getUnderstatName for team name conversion
    const { getUnderstatName } = await import('@/data/teamAliases');

    // Convert display names to Understat format
    const homeTeamUnderstat = getUnderstatName(homeTeam) || homeTeam;
    const awayTeamUnderstat = getUnderstatName(awayTeam) || awayTeam;

    // Fetch match history for both teams using Understat names
    const [homeMatches, awayMatches] = await Promise.all([
        fetchTeamMatches(homeTeamUnderstat, season, league),
        fetchTeamMatches(awayTeamUnderstat, season, league),
    ]);

    // Calculate team stats
    const homeStats = calculateTeamStats(homeTeam, homeMatches, window);
    const awayStats = calculateTeamStats(awayTeam, awayMatches, window);

    // Calculate lambdas using the formula:
    // λ_home = (home_attack + away_def_of_opponent) / 2
    // λ_away = (away_attack_of_opponent + home_def) / 2
    const lambda_home = (homeStats.homeAttack + awayStats.awayDef) / 2;
    const lambda_away = (awayStats.awayAttack + homeStats.homeDef) / 2;

    return {
        matchId: `${homeTeam}_vs_${awayTeam}`,
        homeTeam,
        awayTeam,
        lambda_home,
        lambda_away,
        breakdown: {
            home_attack: homeStats.homeAttack,
            home_def: homeStats.homeDef,
            away_attack: awayStats.awayAttack,
            away_def: awayStats.awayDef,
        },
        window,
    };
}

/**
 * Clear the cache (useful for testing or manual refresh)
 */
export function clearCache(): void {
    cache.clear();
}

/**
 * Clear cache entries matching a pattern
 * @param pattern - String pattern to match against cache keys
 * @returns Number of entries cleared
 */
export function clearCacheByPattern(pattern: string): number {
    let cleared = 0;
    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
            cleared++;
        }
    }
    return cleared;
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { entries: number; keys: string[] } {
    return {
        entries: cache.size,
        keys: Array.from(cache.keys()),
    };
}
