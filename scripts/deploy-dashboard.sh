#!/usr/bin/env bash
#
# The dashboard deploy, as one thing, because it has invariants that three
# separate command lines kept losing:
#
#   - `wrangler` uploads the working tree and not HEAD, so a dirty tree ships
#     code no commit describes and then gets labelled with one that does;
#   - `dashboard/dist` is a deploy input, so a stale build deploys silently;
#   - the `deployed` tag must move only after the deploy has succeeded, or it
#     names a commit that never ran -- which is worse than no tag, because the
#     recovery procedure trusts it.
#
# The emergency purge is the same deploy, so it runs this too rather than a
# retyped approximation of it. See docs/runbooks/dashboard-deploy.md.
#
# PUSH_TAG=1 also publishes the tag, which needs a lease read from the remote:
# `--force-with-lease` alone is rejected for tags, since a tag has no
# remote-tracking ref to lease against.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "refusing to deploy: the working tree is dirty." >&2
  echo "wrangler uploads the tree, not HEAD, so this would ship code that no" >&2
  echo "commit describes and then tag it with one that does." >&2
  git status --short >&2
  exit 1
fi

sha="$(git rev-parse HEAD)"
echo "deploying $sha"

# The lease is read *before* anything reaches production, and checked again
# immediately before the deploy. Reading it only at publish time means two
# concurrent deploys both change production and then discover the conflict
# afterwards -- at which point the tag names one of them and the edge is running
# the other, which is exactly the disagreement the tag exists to prevent.
#
# This narrows the race; it does not remove it. Git has no lock to take here, so
# the window is between the recheck and the deploy returning. What it buys is
# that the loser finds out and says so, instead of both finishing quietly.
lease=""
if [ "${PUSH_TAG:-0}" = "1" ]; then
  lease="$(git ls-remote origin refs/tags/deployed | cut -f1)"
  echo "remote tag before deploy: ${lease:-<none>}"
fi

npm --prefix dashboard run build

if [ "${PUSH_TAG:-0}" = "1" ]; then
  now="$(git ls-remote origin refs/tags/deployed | cut -f1)"
  if [ "$now" != "$lease" ]; then
    echo "refusing to deploy: the remote tag moved while this was building." >&2
    echo "someone else is deploying. find out what the edge is running" >&2
    echo "before either of you continues: npx wrangler deployments list" >&2
    exit 1
  fi
fi

npx wrangler deploy --message "$sha"

# Only now, and to the SHA captured before the build rather than to whatever
# HEAD has become.
git tag -f deployed "$sha"
echo "tagged deployed -> $sha"

if [ "${PUSH_TAG:-0}" = "1" ]; then
  # Leased against the value captured before the deploy, not against whatever
  # the remote says now -- re-reading here would paper over exactly the race
  # this is meant to catch. Without the `=<ref>:<oid>` form git looks for a
  # remote-tracking ref that tags do not have, and rejects the push as stale
  # info every time. An empty OID leases "does not exist yet", the first
  # publish.
  if ! git push --force-with-lease="refs/tags/deployed:${lease}" \
       origin "refs/tags/deployed"; then
    echo >&2
    echo "the tag was published by someone else while this deployed." >&2
    echo "PRODUCTION HAS BEEN CHANGED BY BOTH. the edge is running whichever" >&2
    echo "deploy finished last, and the remote tag names the other one." >&2
    echo "resolve before anything else: npx wrangler deployments list" >&2
    exit 1
  fi
  echo "published the tag (previous remote value: ${lease:-<none>})"
fi
