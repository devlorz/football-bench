import type { HttpRequest } from "../http.js";

export interface MatchPromptFixture {
  fpl_id: number;
  home_team: string;
  away_team: string;
  kickoff_at: Date;
}

export function matchContext(fixture: MatchPromptFixture): string {
  return [
    "Predict this Premier League Fixture.",
    "",
    `Fixture ID: ${fixture.fpl_id}`,
    `Home: ${fixture.home_team}`,
    `Away: ${fixture.away_team}`,
    `Kick-off: ${fixture.kickoff_at.toISOString()}`,
    "",
    "Return only JSON with fixture_id, probs (H, D, A), score (home, away), and rationale.",
    "Probabilities must each be between 0 and 1 and sum to 1. Goals must be non-negative integers."
  ].join("\n");
}

export function openRouterRequest(
  apiKey: string,
  baseModel: string,
  context: string
): HttpRequest {
  return {
    url: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Metadata": "enabled"
    },
    body: JSON.stringify({
      model: baseModel,
      messages: [{ role: "user", content: context }],
      stream: false
    })
  };
}
