#!/usr/bin/env bash

set -euo pipefail

if [ ! -s "${FILL_GAP_REPORT_PATH}" ]; then
  exit 0
fi

body="$(cat "${FILL_GAP_REPORT_PATH}")

Run: ${RUN_URL}

Use the Prediction workflow's manual dispatch to retry this Gameweek before the Lock."

ISSUE_TITLE="Prediction Fill has Gaps" \
ISSUE_BODY="${body}" \
ISSUE_ASSIGNEE="${PREDICT_ALERT_ASSIGNEE:-}" \
  bash scripts/open-or-comment-github-issue.sh
