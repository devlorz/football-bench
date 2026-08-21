import type { HttpRequest } from "../http.js";
import { z } from "zod";

export const MATCH_PROMPT_VERSION = "match/2026-27-v2";
export const MATCH_PROMPT_SHA256 =
  "4e3d03b3bcdeb453eac0dd20640459796ab0cd54d00dc62d10aa7b86c00b83fe";

export interface MatchPrompt {
  /** The Prompt Version a Competition's seats are entered under. */
  version: string;
  /** The sha256 of one fully rendered context at that version. */
  sha256: string;
  /** The template's only variable (ADR-0038). */
  competitionName: string;
  /**
   * The version this Competition restarted away from, on the Competitions that
   * restarted, and absent on the ones that never did. A Competition has one at
   * most: a version is retired by being replaced, and the replacement is
   * `version` above.
   */
  retired?: RetiredGameweek;
}

/**
 * A Prompt Version that was used, is unamendable, and no run will read again,
 * together with the one Gameweek it owns whole (ADR-0042).
 *
 * A field on the Competition rather than a flag anywhere: whether a league has
 * a retired Gameweek to show is answered by whether it has one, and the two
 * values a block needs are the two this holds.
 */
export interface RetiredGameweek {
  version: string;
  gw: number;
}

/**
 * The block's heading, frozen by ADR-0042 and built here because this is where
 * both of its variables live. Nothing else in the repo may spell it: a label
 * that names a version the read does not filter by is the one way this block
 * can lie about which question was asked.
 */
export const retiredGameweekLabel = ({ version, gw }: RetiredGameweek): string =>
  `Gameweek ${gw} — played under ${version}, before the restart`;

/**
 * What the block's RPS may not reach a reader without.
 *
 * The two rankings carry their own stored sentences and this one carries the
 * evidential layer's, which has none to store: ADR-0012 says a claim about one
 * Base Model forecasting better than another rests on Paired Differences and
 * their interval, and ADR-0042 refuses this block both — one Gameweek supports
 * no claim. So the figure is published with the reason it proves nothing,
 * which is the only shape in which it may be published at all.
 *
 * A constant and not a `scores` row: it qualifies no computed number, it is
 * ADR-0042's own sentence, and there is nothing for the scorer to have written
 * it into — the retired version's rows were written before this block existed.
 */
export const RETIRED_GAMEWEEK_CAVEAT =
  "One Gameweek supports no claim. These figures carry no interval and no "
  + "Comparison Anchor, and nothing about whether one Base Model forecasts "
  + "better than another can be read off them.";

/**
 * One template, one frozen Prompt Version per Competition (ADR-0038). The
 * wording is shared; the Competition's name is the only thing that differs, so
 * no two leagues can drift into being asked different questions.
 *
 * The Premier League's two values are the constants above. `match/2026-27-v2`
 * was amended in place rather than frozen by use: ADR-0042 found no stored
 * context under it, and ADR-0026's freeze binds at first use, so it stayed
 * amendable until its first Lock, 2026-08-21T17:30Z, and is unamendable from
 * there. Every other Competition is opened at
 * `match-<code, lowercased>/2026-27-v1`, and opening a league is one entry
 * here. One of seven, though: this file, `DIVISIONS`, the division check
 * constraint, the Understat league and its club map, the transfer windows with
 * their own club map, and the `competition_code` domain if the code is new —
 * gathered in
 * `docs/runbooks/opening-a-competition.md`, because each of these files used to
 * describe its own edit as the single one and none of them was wrong.
 *
 * The sha is over a fully rendered context, not over the template, because
 * that is the mechanism that already exists and what it is worth pinning is
 * the whole prompt's format. Both pins are the suite's render and can be
 * nothing else: the checksum tests hash `buildMatchContext` over the suite's
 * own Fixture and its own Competition data, so a pin taken from a production
 * packet — different clubs, different results — would fail them on the next
 * run. Measured rather than assumed on 2026-08-20: the Premier League's first
 * live packet hashes `f61c8fb4` against this file's `4e3d03b3`, La Liga's
 * `94deaa1c` against `44df40bd`, and neither pair can ever meet.
 *
 * What a real render is for is reading, not hashing. `context:show` renders
 * the packet production will send and an operator reads it; that is how both
 * of `PD`'s earlier moves were *found* — an empty history section behind 842
 * stored rows, and a league table reading `unavailable` — and each fix moved
 * the builder, which moved the suite's render, which moved the pin. The
 * reading is what makes a pin trustworthy; the number was always the suite's.
 * ADR-0045's "re-taken from real renders" is that reading, done on
 * 2026-08-20 over both Competitions with migration 0033 applied and a fetch
 * landed: every club named its Head Coach and no packet carried the
 * unavailable line.
 *
 * `PD` sits on `match-pd/2026-27-v2`. Its v1 was used — La Liga's Gameweek 1,
 * six contexts and sixty Predictions — and so is unamendable and retired: the
 * scorer selects by the version named here, so from this constant's move the
 * v1 seats are out of every run, and Gameweek 1 is kept whole under its own
 * label instead (ADR-0042). v2 is unused until La Liga's Gameweek 2 Lock and
 * unamendable from it.
 */
const MATCH_PROMPTS: Readonly<Record<string, MatchPrompt>> = {
  PL: {
    version: MATCH_PROMPT_VERSION,
    sha256: MATCH_PROMPT_SHA256,
    competitionName: "Premier League"
  },
  PD: {
    version: "match-pd/2026-27-v2",
    sha256:
      "44df40bd38489b8fd380177ec26b4ea24c7b480314c5218ee9181d440f0fd49c",
    competitionName: "La Liga",
    retired: { version: "match-pd/2026-27-v1", gw: 1 }
  },
  // Born on the current template, so neither carries a `retired` block and
  // neither has a v1 to keep whole: both are frozen unused, at their first
  // Lock. Their pins are this suite's render read on 2026-08-21, before either
  // league's history is backfilled — so each league table reads "no result
  // has been played yet this Season" rather than unavailable, the divisions
  // being listed.
  //
  // This block used to end "and each pin moves once when the backfill lands".
  // Serie A's landed on 2026-08-21 and this pin did not move: the pin hashes
  // the suite's render, which is built from a literal and reads no database,
  // so a backfill cannot reach it. What moved `PD`'s pins twice was the
  // builder — an empty history section over 842 stored rows, then a table
  // reading `unavailable` — and each of those was a code change the suite saw.
  // Serie A needed no such fix: its divisions were curated before its first
  // render, and the real packet, read whole over 760 stored results and 380
  // joined xG rows, says what the pinned render says.
  //
  // Ligue 1's landed on 2026-08-21 and its pin did not move either — read,
  // not predicted: the suite stayed green across the backfill, and the real
  // packet was read whole over 611 stored results and 298 joined xG rows.
  SA: {
    version: "match-sa/2026-27-v1",
    sha256:
      "c82e68504614152e4f019e22c3444b87c0b12acb25ab412aace3540b81274b76",
    competitionName: "Serie A"
  },
  FL1: {
    version: "match-fl1/2026-27-v1",
    sha256:
      "dabac3c9a5ee3d4e9ff08a91adb6d53d13562e8c85f312be7f142edf11810468",
    competitionName: "Ligue 1"
  }
};

/** Every Competition the match track has frozen a Prompt Version for. */
export const MATCH_PROMPT_COMPETITIONS: readonly string[] =
  Object.keys(MATCH_PROMPTS);

/**
 * Every frozen Match Prompt Version, for the read that means "a Match seat,
 * whichever Competition it sits in".
 */
export const MATCH_PROMPT_VERSIONS: readonly string[] =
  Object.values(MATCH_PROMPTS).map(({ version }) => version);

/**
 * Loudly, because every caller of this is about to write or read a seat: a
 * Competition with no frozen Prompt Version has no Entrants, and falling back
 * to the Premier League's would seat its ten Entrants twice under one id.
 */
export function matchPromptOf(competition: string): MatchPrompt {
  const prompt = MATCH_PROMPTS[competition];
  if (prompt === undefined) {
    throw new Error(`Competition ${competition} has no frozen Prompt Version`);
  }
  return prompt;
}

/**
 * The retired Gameweek of a Competition that has one, and null for a
 * Competition that never restarted — which is every Competition but La Liga,
 * and the reason the block is one league's and not a page shape every league
 * carries empty.
 */
export function retiredGameweekOf(competition: string): RetiredGameweek | null {
  return matchPromptOf(competition).retired ?? null;
}

export interface MatchPromptFixture {
  fixture_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: Date;
}

export function matchContext(
  fixture: MatchPromptFixture,
  historicalContext: string,
  competition: string
): string {
  return [
    `Predict this ${matchPromptOf(competition).competitionName} Fixture.`,
    "",
    `Fixture ID: ${fixture.fixture_id}`,
    `Home: ${fixture.home_team}`,
    `Away: ${fixture.away_team}`,
    `Kick-off: ${fixture.kickoff_at.toISOString()}`,
    "",
    historicalContext,
    "",
    "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
    "The first character must be { and the last character must be }.",
    "Do not use Markdown or wrap the JSON in code fences.",
    "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers.",
    // ADR-0043, verbatim. Facts and the game's rule, never advice (ADR-0018):
    // the first settles which of two readings `score` has, the second names
    // the rule the probabilities are judged by. Telling an Entrant what to do
    // with either would be the coaching that ADR rejected.
    "score is the exact final scoreline you judge most likely — not expected goals rounded.",
    "Probabilities are scored with the ranked probability score over the ordered outcomes Home, Draw, Away; lower is better."
  ].join("\n");
}

export interface OpenRouterEntrant {
  baseModel: string;
  provider: string;
  quantization: string | null;
}

export interface OpenRouterMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The conversation as it goes on the wire: the first message's text wrapped in
 * one content block ending with one `cache_control` breakpoint, every later
 * turn left as it stands (spec 0010).
 *
 * The breakpoint is uniform and semantically inert. The two providers that
 * require it stated begin discounting the prefix a Repair chain re-sends, the
 * seven that discount on their own ignore it, and no seat's envelope differs
 * from another's. It lives in the envelope only: the stored context text, its
 * hash and the Prompt Version are untouched by it.
 */
function withCacheBreakpoint(
  messages: readonly OpenRouterMessage[]
): unknown[] {
  const [first, ...rest] = messages;
  if (first === undefined) {
    return [];
  }
  return [
    {
      role: first.role,
      content: [{
        type: "text",
        text: first.content,
        cache_control: { type: "ephemeral" }
      }]
    },
    ...rest
  ];
}

/**
 * How long an Entrant may think before the client stops listening.
 *
 * Read off the record rather than rounded, and the record is unusually plain
 * about it. Over the two Gameweeks run by hand on 2026-08-20 — La Liga's
 * Gameweek 2 and the Premier League's Gameweek 1, the first asked under the
 * restarted Prompt Versions — five seats Gapped 37 times between them, and
 * every one of the five has a maximum latency between 120,005ms and 120,020ms:
 * DeepSeek V4 Pro 16 Gaps on a 101.6s mean, Qwen3.8 Max 9 on 93.1s, Kimi K3 5
 * on 73.9s, GLM 5.3 4 on 73.4s, Grok 4.6 3 on 59.6s. The five seats that never
 * Gapped top out at 28,785ms — Claude Opus 5 means 6.2s, GPT-5.6 Sol Pro 14.5s,
 * Gemini 3.1 Pro Preview 15.2s.
 *
 * Ninety-one seconds separate the two groups with nothing in between, and a
 * maximum that clears the ceiling by fifteen milliseconds is the ceiling being
 * hit rather than a distribution ending. So the true tail is longer than
 * anything here was allowed to measure, and the means are the only honest
 * anchor there is. Five minutes is roughly three times the slowest of them,
 * which leaves room for a tail nobody has seen while still failing a seat that
 * has genuinely stopped answering.
 *
 * This benchmark exists to compare Base Models that think for different
 * lengths, so a window is a claim about how long thinking may take. Stated per
 * call (`ENTRANT_CALL_TIMEOUT_MS`) rather than defaulted globally, because the
 * FPL prompt sits far above the Match one (spec 0010) and only the Match shape
 * was measured here — which is why the FPL track keeps its own default.
 */
export const DEFAULT_ENTRANT_CALL_TIMEOUT_MS = 300_000;

/**
 * The largest answer a seat is paid to write.
 *
 * A request that names no ceiling is priced by OpenRouter against whatever
 * output ceiling the Base Model allows, and refused when the balance cannot
 * cover that ceiling rather than the call. That is what the sixteen HTTP 402s
 * on the Premier League's Gameweek 1 were, with $1.61 still in the account and
 * each refused call worth about two cents.
 *
 * 16,000 is roughly two and a half times the longest completion any seat has
 * been watched finish — 6,138 — and deliberately not read off that number,
 * because the calls cancelled at the old two-minute clock were cut mid-answer
 * and their counts are floors rather than lengths. The per-seat record, the
 * arithmetic that ties it to the day's 248 generations, and the one call that
 * proves the cut all live in
 * `docs/reports/2026-08-20-completion-tokens-per-seat.md` rather than being
 * retold here. The number is provisional against the first run whose maxima
 * are not censored, which the five-minute window makes possible.
 *
 * Those counts are `tokens_completion`, which contains `tokens_reasoning`
 * rather than sitting beside it: across the 183 rows carrying both, the
 * difference runs 11 to 458 tokens on a mean of 259 — the size of a Prediction
 * and its rationale, not a second quantity of thinking that would need adding.
 *
 * The FPL track sent through here unmeasured, and the Season's first opening
 * measured it: `fpl/minimax-m3` read a 29,031-token FPL prompt on 2026-08-20
 * and returned `finish_reason: "length"` with completion 16,000 of which
 * reasoning was 16,000 — the whole ceiling spent thinking, `content` null, two
 * and a half cents for an empty answer. Not an answer cut mid-sentence: a seat
 * that never reached the sentence. The Match measurement above could not have
 * predicted it, because a Match prompt is a fraction of this one and its
 * reasoning ran 11 to 458 tokens past the content rather than swallowing it.
 *
 * So the ceiling doubles to 32,000, which is the run this comment called for —
 * "provisional against the first run whose maxima are not censored" — reading
 * back. It is still a ceiling and still provisional: a seat that spent 16,000
 * without finishing may spend 32,000 without finishing, and the next run whose
 * maxima are not censored is what tells us. An answer this ceiling cuts is
 * recorded against `TRUNCATED_AT_CEILING`, never as the seat's own failure —
 * except where the ceiling takes the content with it, which ticket 0026
 * records as the one path that still misreports it.
 */
export const ENTRANT_MAX_OUTPUT_TOKENS = 32_000;

/**
 * What a call says when `ENTRANT_MAX_OUTPUT_TOKENS` is what ended it.
 *
 * A ceiling that cuts an answer mid-sentence produces text that is not JSON,
 * and every path here would otherwise record that as the seat having answered
 * badly — indistinguishable in the record from a Base Model that genuinely
 * cannot hold the schema. The two have opposite fixes: one raises the number
 * above, the other is the seat's own result. So a call the provider reports as
 * `finish_reason: "length"` is recorded against this sentence rather than
 * against whatever the fragment failed to parse as.
 */
export const TRUNCATED_AT_CEILING = "The answer was cut off at the "
  + `${ENTRANT_MAX_OUTPUT_TOKENS}-token output ceiling (finish_reason: length),`
  + " so this is where the ceiling stopped the seat rather than how the seat"
  + " answered.";

export function openRouterRequest(
  apiKey: string,
  entrant: OpenRouterEntrant,
  messagesOrInitialPrompt: string | OpenRouterMessage[]
): HttpRequest {
  const provider = {
    order: [entrant.provider],
    allow_fallbacks: false,
    ...(entrant.quantization === null
      ? {}
      : { quantizations: [entrant.quantization] })
  };
  return {
    url: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled"
    },
    body: JSON.stringify({
      model: entrant.baseModel,
      messages: withCacheBreakpoint(
        typeof messagesOrInitialPrompt === "string"
          ? [{ role: "user", content: messagesOrInitialPrompt }]
          : messagesOrInitialPrompt
      ),
      provider,
      stream: false,
      max_tokens: ENTRANT_MAX_OUTPUT_TOKENS
    })
  };
}

const openRouterResponseSchema = z.looseObject({
  choices: z.array(z.looseObject({
    message: z.looseObject({
      content: z.string().nullable(),
      refusal: z.string().min(1).nullable().optional()
    }),
    finish_reason: z.string().min(1).nullable().optional()
  })).min(1),
  openrouter_metadata: z.looseObject({
    endpoints: z.looseObject({
      available: z.array(z.looseObject({
        provider: z.string().min(1),
        model: z.string().min(1).optional(),
        selected: z.boolean()
      }))
    })
  }).optional(),
  usage: z.looseObject({
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional()
  }).optional()
});

export interface ParsedOpenRouterResponse {
  content: string | null;
  refusal: string | null;
  /** `"length"` when the ceiling stopped the answer — see `truncatedAtCeiling`. */
  finishReason: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export function parseOpenRouterResponse(
  body: string
): ParsedOpenRouterResponse | null {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = openRouterResponseSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const [choice] = parsed.data.choices;
  if (choice === undefined) {
    throw new Error("OpenRouter response schema admitted an empty choices array");
  }
  const selectedEndpoint = parsed.data.openrouter_metadata
    ?.endpoints.available.find(({ selected }) => selected);

  return {
    content: choice.message.content,
    refusal: choice.message.refusal ?? null,
    finishReason: choice.finish_reason ?? null,
    resolvedProvider: selectedEndpoint?.provider ?? null,
    resolvedModel: selectedEndpoint?.model ?? null,
    tokensIn: parsed.data.usage?.prompt_tokens ?? null,
    tokensOut: parsed.data.usage?.completion_tokens ?? null
  };
}
