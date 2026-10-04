#!/bin/sh
# Replaces this server's app containers without downtime: starts a new set of replicas next to
# the old ones, waits for them to become healthy, then gracefully stops the old ones.
# Usage: scripts/rolling-update.sh [--build]   (default: pull the image from the registry)
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--build" ]; then
    GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || true) docker compose build app
else
    docker compose pull app
fi

old=$(docker compose ps -q app)
count=$(echo "$old" | grep -c . || true)
if [ "$count" -eq 0 ]; then
    exec docker compose up -d --wait
fi

echo "Starting $count new replicas next to the $count running ones"
docker compose up -d --no-deps --no-recreate --scale app=$((count * 2)) --wait app
# give nginx time to re-resolve the service (resolver valid=5s) so it knows the new replicas
sleep 10

echo "Stopping old replicas"
# SIGTERM: each one drains for SHUTDOWN_DELAY and finishes in-flight requests before exiting
docker stop $old >/dev/null
docker rm $old >/dev/null

docker compose up -d --no-deps --no-recreate --scale app="$count" app
docker compose ps app
