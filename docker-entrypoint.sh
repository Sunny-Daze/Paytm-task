#!/bin/sh
set -e

  node_modules/.bin/node-pg-migrate up --use-glob --migrations-dir "dist/db-migrations/*.js"
fi

exec node dist/server.js
