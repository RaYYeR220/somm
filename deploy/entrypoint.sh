#!/bin/sh
# Restore the database from Cloud Storage (if a replica exists), then run the app under Litestream.
set -e
mkdir -p "$DATA_DIR"
if [ -n "$LITESTREAM_BUCKET" ]; then
  export LITESTREAM_REPLICA_URL="gs://$LITESTREAM_BUCKET/somm/db"
  litestream restore -if-db-not-exists -if-replica-exists -o "$DATA_DIR/somm.sqlite" "$LITESTREAM_REPLICA_URL"
  exec litestream replicate -exec "node server.js"
fi
exec node server.js
