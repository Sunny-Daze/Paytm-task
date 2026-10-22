#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  node_modules/.bin/node-pg-migrate up --use-glob --migrations-dir "dist/db-migrations/*.js"
fi

exec node dist/server.js
