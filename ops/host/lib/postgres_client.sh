#!/usr/bin/env bash

if [ -z "${OPENCLAW_POSTGRES_CLIENT_IMAGE:-}" ]; then
  OPENCLAW_POSTGRES_CLIENT_IMAGE="postgres:17-alpine"
fi

export OPENCLAW_POSTGRES_CLIENT_IMAGE
