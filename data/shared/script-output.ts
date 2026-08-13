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

export function suggest(command: string): void {
  console.log(`\n  ${BLUE}${command}${RESET}`);
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
