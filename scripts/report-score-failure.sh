#!/usr/bin/env bash

set -euo pipefail

body="The daily scoring run failed: ${RUN_URL}

Scoring reads stored rows only, so the record is unchanged until it succeeds.
Check the failed job, then re-run it by hand once the cause is fixed."

ISSUE_TITLE="Match track scoring is failing" \
ISSUE_BODY="${body}" \
ISSUE_ASSIGNEE="${SCORE_ALERT_ASSIGNEE:-}" \
  bash scripts/open-or-comment-github-issue.sh
