#!/usr/bin/env bash

set -euo pipefail

: "${ISSUE_TITLE:?ISSUE_TITLE is required}"
: "${ISSUE_BODY:?ISSUE_BODY is required}"

issue_number="$(
  gh issue list \
    --state open \
    --search "\"${ISSUE_TITLE}\" in:title" \
    --json number,title \
    --jq "map(select(.title == \"${ISSUE_TITLE}\")) | first | .number // empty"
)"

if [ -n "${issue_number}" ]; then
  gh issue comment "${issue_number}" --body "${ISSUE_BODY}"
elif [ -n "${ISSUE_ASSIGNEE:-}" ]; then
  gh issue create \
    --title "${ISSUE_TITLE}" \
    --body "${ISSUE_BODY}" \
    --assignee "${ISSUE_ASSIGNEE}"
else
  gh issue create --title "${ISSUE_TITLE}" --body "${ISSUE_BODY}"
fi
