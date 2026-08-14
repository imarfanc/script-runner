#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/helpers.sh"

print_heading "Multi-file inventory"
while IFS='|' read -r name category value; do
  print_record "$name" "$category" "$value"
done < "$SCRIPT_DIR/records.txt"

printf '\nLoaded %s sibling files successfully.\n' "2"
