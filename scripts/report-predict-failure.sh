#!/usr/bin/env bash

set -euo pipefail

body="The Prediction workflow failed: ${RUN_URL}

This signal is distinct from a completed run's Gap report. Check the failed job before retrying."

ISSUE_TITLE="Prediction workflow is failing" \
ISSUE_BODY="${body}" \
ISSUE_ASSIGNEE="${PREDICT_ALERT_ASSIGNEE:-}" \
  bash scripts/open-or-comment-github-issue.sh
