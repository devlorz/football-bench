-- Ticket 0066's pre-flight, run 2026-09-06 against Premier League Gameweek 4's
-- Fixture 32 with `{"reasoning": {"effort": "none"}}` on the wire: Kimi K3
-- and DeepSeek V4 Pro answered with `reasoning_tokens: 0` and a parseable
-- Prediction each; GLM 5.3's endpoint refused the call outright --
--
--   HTTP 400: "Reasoning is mandatory for this endpoint and cannot be
--   disabled."
--
-- That is the case ticket 0066 wrote down before it happened: "A rejected
-- shadow is not seated; the ticket records which and the ADR's list of three
-- is amended to the ones that ran." A Shadow Seat that cannot take the one
-- key that makes it a Shadow measures nothing, and left seated it would be
-- asked every Fixture of every Gameweek from the 12th, refused every time,
-- and fill the ledger with ten HTTP 400s a Gameweek for nothing.
--
-- Deleted rather than withdrawn (ADR-0047's `withdrawn_at`): the prediction
-- run selects Shadows by role alone and does not read `withdrawn_at`, so a
-- withdrawal would not stop the calls; and the row has no history to keep --
-- no attempt, no Prediction, no context was ever written under it, and the
-- guard below refuses to run if any has been. What the pre-flight itself
-- wrote sits in `raw_snapshots` under `openrouter-preflight:z-ai/glm-5.3`,
-- keyed by Base Model rather than by seat, and stays.
--
-- A database that never seated the shadow (a fresh clone, the test suite)
-- has nothing to delete and is let through.

do $$
declare
  history_count integer;
begin
  select
    (select count(*) from attempts where model_id = 'match/shadow-glm-5.3')
    + (select count(*) from predictions where model_id = 'match/shadow-glm-5.3')
    + (select count(*) from contexts where model_id = 'match/shadow-glm-5.3')
    into history_count;

  if history_count > 0 then
    raise exception
      'refuses to delete match/shadow-glm-5.3: % rows of record already '
      'stand under it, and a seat with history is withdrawn, not deleted',
      history_count;
  end if;

  delete from models
   where id = 'match/shadow-glm-5.3' and role = 'shadow';
end $$;
