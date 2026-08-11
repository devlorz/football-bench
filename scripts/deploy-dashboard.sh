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

npm --prefix dashboard run build
npx wrangler deploy --message "$sha"

# Only now, and to the SHA captured before the build rather than to whatever
# HEAD has become.
git tag -f deployed "$sha"
echo "tagged deployed -> $sha"

if [ "${PUSH_TAG:-0}" = "1" ]; then
  # The lease is the remote's current value, read explicitly. Without the
  # `=<ref>:<oid>` form git looks for a remote-tracking ref that tags do not
  # have and rejects the push as stale. An empty OID leases "does not exist
  # yet", which is the first publish.
  old="$(git ls-remote origin refs/tags/deployed | cut -f1)"
  git push --force-with-lease="refs/tags/deployed:${old}" \
    origin "refs/tags/deployed"
  echo "published the tag (previous remote value: ${old:-<none>})"

  # A rejection here means someone else deployed while this ran, and the tag
  # now names their commit rather than ours. Two deploys raced; find out which
  # one the edge is actually running before touching anything.
fi
