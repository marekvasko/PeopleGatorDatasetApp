#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=${COMPOSE_ENV_FILE:-"$SCRIPT_DIR/.env"}

case "$ENV_FILE" in
  /*) ;;
  *) ENV_FILE="$(pwd)/$ENV_FILE" ;;
esac

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file not found: $ENV_FILE" >&2
  echo "Create it with: cp $SCRIPT_DIR/.env.example $SCRIPT_DIR/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a


exec docker compose --env-file "$ENV_FILE" -f "$SCRIPT_DIR/compose.yaml" "$@"
