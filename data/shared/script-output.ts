/**
 * Shared output helpers for scripts, and the TypeScript twin of
 * `script-output.sh`. Scripts live three levels down, so import it by path:
 *
 *   import { heading, ok, fail } from "../../../shared/script-output.ts";
 *
 * The colours match the app's status vocabulary: green means done, amber means
 * something is waiting on you, red means it failed. Running commands lives next
 * door in `process.ts`.
 */
import { which } from "./process.ts";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const AMBER = "\x1b[33m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

export function heading(text: string): void {
  console.log(`\n${BOLD}${text}${RESET}`);
}

export function ok(text: string): void {
  console.log(`  ${GREEN}✓${RESET} ${text}`);
}

export function todo(text: string): void {
  console.log(`  ${AMBER}•${RESET} ${text}`);
}

export function fail(text: string): void {
  console.log(`  ${RED}✕${RESET} ${text}`);
}

export function info(text: string): void {
  console.log(`  ${DIM}${text}${RESET}`);
}

/** A command the person should run themselves, in a shell that is really theirs. */
export function suggest(command: string): void {
  console.log(`\n  ${BLUE}${command}${RESET}`);
}

/** Kept for scripts that only want a yes or no; `which` in process.ts gives the path. */
export function has(command: string): boolean {
  return which(command) !== null;
}

/** 1536 → "1.5 KB". Bytes are shown whole; everything larger gets one decimal. */
export function humanSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return unit === 0 ? `${Math.floor(size)} B` : `${size.toFixed(1)} ${units[unit]}`;
}

export type CellColor = "green" | "amber" | "red" | "blue" | "dim" | "bold";

export interface Cell {
  text: string;
  color?: CellColor;
}

export type Row = (string | Cell)[];

const COLORS: Record<CellColor, string> = {
  green: GREEN,
  amber: AMBER,
  red: RED,
  blue: BLUE,
  dim: DIM,
  bold: BOLD,
};

function toCell(value: string | Cell): Cell {
  return typeof value === "string" ? { text: value } : value;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function pad(cell: Cell, width: number): string {
  const padded = cell.text.padEnd(width);
  return cell.color ? `${COLORS[cell.color]}${padded}${RESET}` : padded;
}

export function table(headers: string[], rows: Row[], maxColumnWidth = 44): void {
  if (rows.length === 0) return;
  const body = rows.map((row) =>
    row.map(toCell).map((cell) => ({ ...cell, text: clip(cell.text, maxColumnWidth) }))
  );
  const head = headers.map((header) => clip(header, maxColumnWidth));
  const widths = head.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index]?.text.length ?? 0))
  );
  const last = widths.length - 1;
  const render = (cells: Cell[]) =>
    `  ${
      cells.map((cell, index) => pad(cell, index === last ? 0 : widths[index]!)).join("  ")
        .trimEnd()
    }`;

  console.log(render(head.map((text) => ({ text, color: "bold" }))));
  console.log(render(widths.map((width) => ({ text: "─".repeat(width), color: "dim" }))));
  for (const row of body) console.log(render(widths.map((_, index) => row[index] ?? { text: "" })));
}
