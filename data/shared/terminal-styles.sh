#!/usr/bin/env bash

# Shared ANSI presentation helpers for scripts that want structured output.
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
BLUE='\033[34m'

print_title() {
  printf "${BOLD}${CYAN}%s${RESET}\n" "$1"
  printf "${DIM}%s${RESET}\n" "────────────────────────────────────────────────────────"
}

print_table_header() {
  printf "${BOLD}%-20s %-12s %8s${RESET}\n" "$1" "$2" "$3"
}

print_table_row() {
  local color="$1"
  shift
  printf "${color}%-20s${RESET} %-12s %8s\n" "$1" "$2" "$3"
}

print_badge() {
  local color="$1"
  shift
  printf "${color}${BOLD}[ %s ]${RESET}" "$1"
}
