#!/usr/bin/env bash
set -eu
for n in 5 4 3 2 1; do
  printf '\033[33m%s…\033[0m\n' "$n"
  sleep 1
done
printf '\033[32mdone\033[0m\n'
