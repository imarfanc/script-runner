#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../../../shared/terminal-styles.sh"

print_title "Service health"
print_table_header "SERVICE" "STATUS" "LATENCY"
print_table_row "$GREEN" "API gateway" "healthy" "18 ms"
print_table_row "$GREEN" "Postgres" "healthy" "7 ms"
print_table_row "$YELLOW" "Job worker" "degraded" "240 ms"
print_table_row "$RED" "Email relay" "offline" "—"

printf '\n'
print_badge "$GREEN" "2 healthy"
printf '  '
print_badge "$YELLOW" "1 degraded"
printf '  '
print_badge "$RED" "1 offline"
printf '\n'
