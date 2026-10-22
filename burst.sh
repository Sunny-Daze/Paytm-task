#!/bin/sh
set -e
exec node "$(dirname "$0")/scripts/burst.mjs" "$@"
