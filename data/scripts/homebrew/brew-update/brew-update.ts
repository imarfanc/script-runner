#!/usr/bin/env -S deno run -A
import { fail, heading, info, ok, suggest, todo } from "../../../shared/script-output.ts";

const CHECK_ONLY = Deno.args.includes("--check") || Deno.args.includes("--dry-run");
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const AMBER = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const KNOWN_PREFIXES = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"];

function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

function which(command: string): string | null {
  for (const directory of (Deno.env.get("PATH") ?? "").split(":")) {
    if (directory && exists(`${directory}/${command}`)) return `${directory}/${command}`;
  }
  return null;
}

function findBrew(): string | null {
  return which("brew") ?? KNOWN_PREFIXES.find(exists) ?? null;
}

const WIDTH = Math.min(Number(Deno.env.get("COLUMNS") ?? 0) || 72, 88);

function rule(color: string, note: string): void {
  const text = ` ${note} `;
  const dashes = Math.max(0, WIDTH - text.length - 2);
  console.log(`${color}${"─".repeat(2)}${text}${"─".repeat(dashes)}${RESET}\n`);
}

interface Step {
  label: string;
  args: string[];
  mutates?: boolean;
  note?: string;
}

const STEPS: Step[] = [
  { label: "brew update", args: ["update"], mutates: true, note: "refresh tap metadata" },
  { label: "brew outdated", args: ["outdated", "--verbose"], note: "what has fallen behind" },
  { label: "brew upgrade", args: ["upgrade"], mutates: true, note: "install newer versions" },
  { label: "brew cleanup", args: ["cleanup"], mutates: true, note: "discard superseded versions" },
  {
    label: "brew cleanup --prune=all",
    args: ["cleanup", "--prune=all"],
    mutates: true,
    note: "empty the download cache",
  },
  { label: "brew --version", args: ["--version"], note: "what ran all of the above" },
  { label: "brew doctor", args: ["doctor"], note: "anything Homebrew is unhappy about" },
];

const brew = findBrew();
if (!brew) {
  heading("Homebrew");
  fail("brew was not found on PATH or in either standard prefix");
  info("Installing Homebrew needs a real terminal because it asks for your password.");
  suggest('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"');
  Deno.exit(1);
}

console.log(`${DIM}using ${brew}${RESET}`);
if (CHECK_ONLY) todo("--check: the steps that would change something are skipped");
console.log("");

const failures: string[] = [];
for (const step of STEPS) {
  const note = step.note ? ` ${DIM}${step.note}${RESET}` : "";
  console.log(`${CYAN}${BOLD}▌ ${step.label}${RESET}${note}`);
  if (CHECK_ONLY && step.mutates) {
    console.log(`  ${AMBER}•${RESET} skipped`);
    rule(AMBER, "skipped");
    continue;
  }
  const { code } = await new Deno.Command(brew, {
    args: step.args,
    stdin: "null",
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (code === 0) rule(GREEN, "ok");
  else {
    failures.push(step.label);
    rule(RED, `exit ${code}`);
  }
}

heading("Summary");
if (failures.length === 0) ok(`${STEPS.length} steps, no failures`);
else {
  fail(`${failures.length} of ${STEPS.length} steps exited non-zero`);
  for (const label of failures) info(label);
  info("brew doctor exits non-zero for warnings it expects you to read, not always act on.");
}
