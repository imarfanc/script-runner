#!/usr/bin/env bash
set -eu
printf '\033[36mHello from %s\033[0m\n' "$(hostname)"
printf 'User: %s\n' "$(whoami)"
printf 'Date: %s\n' "$(date)"
