#!/usr/bin/env bash

set -euo pipefail

title="Prediction workflow is failing"
issue_number="$(
  gh issue list \
    --state open \
    --search "\"${title}\" in:title" \
    --json number,title \
    --jq 'map(select(.title == "Prediction workflow is failing")) | first | .number // empty'
)"
body="The Prediction workflow failed: ${RUN_URL}

This signal is distinct from a completed run's Gap report. Check the failed job before retrying."

if [ -n "${issue_number}" ]; then
  gh issue comment "${issue_number}" --body "${body}"
elif [ -n "${PREDICT_ALERT_ASSIGNEE:-}" ]; then
  gh issue create \
    --title "${title}" \
    --body "${body}" \
    --assignee "${PREDICT_ALERT_ASSIGNEE}"
else
  gh issue create --title "${title}" --body "${body}"
fi
