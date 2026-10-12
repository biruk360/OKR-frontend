#!/usr/bin/env bash
# Serialises `tsc --noEmit` across parallel build agents (one at a time, 16 GB box).
# Usage: scripts/dev/tsc-locked.sh [grep-pattern]   → prints matching errors (or all when no pattern)
set -u
cd "$(dirname "$0")/../.."
LOCK=/tmp/okr-eop-tsc.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 3; done
trap 'rmdir "$LOCK"' EXIT
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --pretty false > /tmp/okr-eop-tsc.out 2>&1
if [ $# -gt 0 ]; then grep -E "$1" /tmp/okr-eop-tsc.out || echo "no errors matching: $1"; else cat /tmp/okr-eop-tsc.out; echo "total error lines: $(grep -c 'error TS' /tmp/okr-eop-tsc.out)"; fi
