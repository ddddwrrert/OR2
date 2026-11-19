#!/bin/bash
set -u
if docker info >/dev/null 2>&1; then
  echo DOCKER_OK
  docker info --format '{{.ServerVersion}}'
else
  echo DOCKER_NO
  docker info 2>&1 | head -n 20
fi
ls -l /var/run/docker.sock 2>/dev/null || true
