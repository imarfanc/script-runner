import {
  moveSelection,
  parseMouse,
  pickerRows,
  taskIndexAtScreenRow,
  type TaskName,
  TASKS,
} from "./choose-lib.ts";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const CYAN = `${ESC}36m`;
const DIM = `${ESC}2m`;
const BOLD = `${ESC}1m`;
const RED = `${ESC}31m`;

if (Deno.args.includes("--help") || Deno.args.includes("-h")) {
  console.log(`${BOLD}choose${RESET} — select a primary repository task

Usage:
  deno task choose
  deno task choose <dev|start|check|git:history>

Controls:
  ↑/↓ or j/k   move
  1–4          run by number
  enter        run selected
  click        select; click selected task to run
  mouse wheel  move
  escape/q     cancel`);
  Deno.exit(0);
}

const requested = Deno.args[0];
if (requested) {
  const task = TASKS.find(({ name }) => name === requested);
  if (!task) {
    console.error(`${RED}error${RESET} unknown task: ${requested}`);
    Deno.exit(1);
  }
  Deno.exit(await run(task.name));
}

if (!Deno.stdin.isTerminal() || !Deno.stdout.isTerminal()) {
  console.error(
    `${RED}error${RESET} choose requires a terminal; use \`deno task <name>\` directly`,
  );
  Deno.exit(1);
}

let selected = 0;
let finished = false;
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const buffer = new Uint8Array(64);
const rows = pickerRows();

try {
  Deno.stdin.setRaw(true);
  Deno.stdout.writeSync(encoder.encode(`${ESC}?1000h${ESC}?1006h`));
  render();
  while (!finished) {
    const count = await Deno.stdin.read(buffer);
    if (count === null) break;
    const input = decoder.decode(buffer.subarray(0, count));
    if (input === "\x03" || input === "\x1b" || input === "q") break;
    const mouse = parseMouse(input);
    if (mouse?.kind === "scroll") selected = moveSelection(selected, mouse.delta);
    else if (mouse?.kind === "click") {
      const clicked = taskIndexAtScreenRow(rows, mouse.row);
      if (clicked !== null) {
        if (clicked === selected) finished = true;
        else selected = clicked;
      }
    } else if (input === "\x1b[A" || input === "k") selected = moveSelection(selected, -1);
    else if (input === "\x1b[B" || input === "j") {
      selected = moveSelection(selected, 1);
    } else if (/^[1-4]$/.test(input)) {
      selected = Number(input) - 1;
      finished = true;
    } else if (input === "\r" || input === "\n") finished = true;
    render();
  }
} finally {
  Deno.stdin.setRaw(false);
  console.log(`${ESC}?1000l${ESC}?1006l${ESC}?25h${RESET}`);
}

if (finished) Deno.exit(await run(TASKS[selected]!.name));

function render(): void {
  const width = Math.max(...TASKS.map(({ name }) => name.length));
  const output = rows.map((row) => {
    if (row.kind === "heading") {
      return `${DIM}── ${row.group.toUpperCase()} ${
        "─".repeat(Math.max(0, width + 24 - row.group.length))
      }${RESET}`;
    }
    const active = row.taskIndex === selected;
    const marker = active ? `${CYAN}❯${RESET}` : " ";
    const name = row.task.name.padEnd(width);
    return `${marker}  ${active ? BOLD : ""}${
      row.taskIndex + 1
    }  ${name}${RESET}  ${DIM}${row.task.description}${RESET}`;
  });
  console.log(
    `${ESC}2J${ESC}H${ESC}?25l${BOLD}${CYAN}WhatsApp Sender tasks${RESET}\n\n${
      output.join("\n")
    }\n\n${DIM}↑/↓ move · click select/run · enter run · q quit${RESET}`,
  );
}

async function run(name: TaskName): Promise<number> {
  console.log(`\n${DIM}$ deno task ${name}${RESET}\n`);
  const child = new Deno.Command(Deno.execPath(), {
    args: ["task", name],
    cwd: repositoryRoot(),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  return (await child.status).code;
}

function repositoryRoot(): string {
  return decodeURIComponent(new URL("../../", import.meta.url).pathname);
}
