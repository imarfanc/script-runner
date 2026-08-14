#!/usr/bin/env bash

print_heading() {
  printf '\033[1;34m%s\033[0m\n' "$1"
  printf '%-18s %-14s %s\n' "NAME" "CATEGORY" "VALUE"
  printf '%-18s %-14s %s\n' "────────────────" "────────────" "────────"
}

print_record() {
  printf '%-18s %-14s %s\n' "$1" "$2" "$3"
}
