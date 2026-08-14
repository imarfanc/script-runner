import { icons } from "./icons.ts";

type Mode = "dev" | "start";

const mode = Deno.args[0] as Mode | undefined;
const help = Deno.args.includes("--help") || Deno.args.includes("-h");
const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const PORT = Number(Deno.env.get("PORT") ?? "8000");
const BASE_URL = `http://localhost:${PORT}/`;
const HELIUM = "/Applications/Helium.app/Contents/MacOS/Helium";
const TEXT_FONT = await matchFont("MesloLGS Nerd Font");
const EMOJI_FONT = await matchFont(":charset=1f30d");
const color = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");
const paint = (code: number, text: string) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
const bold = (text: string) => paint(1, text);
const dim = (text: string) => paint(2, text);
const cyan = (text: string) => paint(36, text);
const green = (text: string) => paint(32, text);
const yellow = (text: string) => paint(33, text);
const red = (text: string) => paint(31, text);

if (help || (mode !== "dev" && mode !== "start")) {
  console.log(`${bold("serve")} — run Script Runner with browser hotkeys

Usage:
  deno task dev
  deno task start

Hotkeys:
  b  open in the default browser
  h  open in Helium
  a  open in Helium app mode
  x  stop the server

Ctrl+C and Ctrl+D also stop the server.`);
  Deno.exit(mode === "dev" || mode === "start" || help ? 0 : 1);
}

const args = ["run", "-A"];
if (mode === "dev") args.push("--watch=src/,data/,public/");
args.push("src/main.ts");

const server = new Deno.Command(Deno.execPath(), {
  args,
  cwd: ROOT,
  stdin: "null",
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

let stopping = false;
let raw = false;
printBanner();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => void stop(signal === "SIGINT" ? "Ctrl+C" : signal));
}
if (Deno.stdin.isTerminal()) void watchInput();

const status = await server.status;
restoreInput();
Deno.exit(stopping ? 0 : status.code);

async function watchInput(): Promise<void> {
  try {
    Deno.stdin.setRaw(true, { cbreak: true });
    raw = true;
  } catch {
    raw = false;
  }
  const buffer = new Uint8Array(32);
  try {
    while (!stopping) {
      const count = await Deno.stdin.read(buffer);
      if (count === null) return await stop("Ctrl+D");
      for (let index = 0; index < count; index++) {
        const byte = buffer[index]!;
        if (byte === 0x03) return await stop("Ctrl+C");
        if (byte === 0x04) return await stop("Ctrl+D");
        switch (String.fromCharCode(byte).toLowerCase()) {
          case "b":
            void openBrowser(BASE_URL);
            break;
          case "h":
            void openBrowser(BASE_URL, "Helium");
            break;
          case "a":
            void openAppMode(BASE_URL);
            break;
          case "x":
            return await stop("x");
        }
      }
    }
  } catch (error) {
    if (!stopping) console.error(`${red("error")} ${message(error)}`);
  }
}

async function stop(reason: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  restoreInput();
  console.log(`\n${dim(clock())} ${cyan("INFO")} 👋 shutting down ${dim(`via=${reason}`)}`);
  try {
    server.kill("SIGINT");
  } catch {
    return;
  }
  const stopped = await Promise.race([
    server.status.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 750)),
  ]);
  if (!stopped) {
    try {
      server.kill("SIGKILL");
    } catch {
      // The child exited between the timeout and signal.
    }
  }
}

function restoreInput(): void {
  if (!raw) return;
  raw = false;
  try {
    Deno.stdin.setRaw(false);
  } catch {
    // The terminal closed while the server was running.
  }
}

async function openBrowser(url: string, application?: string): Promise<void> {
  if (Deno.build.os !== "darwin") return warn("browser hotkeys are macOS-only");
  const args = application ? ["-a", application, url] : [url];
  try {
    const result = await new Deno.Command("open", {
      args,
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).output();
    if (!result.success) return warn(`could not open ${application ?? "the default browser"}`);
    console.log(
      `${green("open")} ${bold(url)} ${dim(`in ${application ?? "the default browser"}`)}`,
    );
  } catch (error) {
    warn(message(error));
  }
}

async function openAppMode(url: string): Promise<void> {
  if (Deno.build.os !== "darwin") return warn("Helium app mode is macOS-only");
  try {
    await Deno.stat(HELIUM);
    new Deno.Command(HELIUM, {
      args: [`--app=${url}`],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    console.log(`${green("open")} ${bold(url)} ${dim("in Helium app mode")}`);
  } catch (error) {
    warn(
      error instanceof Deno.errors.NotFound
        ? `Helium is not installed at ${HELIUM}`
        : message(error),
    );
  }
}

function printBanner(): void {
  const rows = [
    [icons.online, "URL", BASE_URL],
    [icons.mode, "Mode", mode === "dev" ? "watching" : "start once"],
    [icons.text, "Text match", TEXT_FONT],
    [icons.emoji, "Emoji match", EMOJI_FONT],
    [icons.terminal, "Terminal", Deno.env.get("TERM_PROGRAM") ?? "not reported"],
    [icons.browser, "b", "default browser"],
    [icons.helium, "h", "Helium"],
    [icons.app, "a", "Helium app mode"],
    [icons.exit, "x", "exit"],
  ];
  const first = Math.max(...rows.map((row) => displayWidth(row[1]!)));
  const content = rows.map(([emoji, key, value]) =>
    `${emoji}  ${padDisplay(key!, first)}  ${value}`
  );
  const title = "Script Runner server";
  const width = Math.max(34, displayWidth(title) + 2, ...content.map(displayWidth)) + 2;
  const rightColumn = width + 2;
  const keyColumn = 7;
  const valueColumn = keyColumn + first + 2;
  console.log("");
  console.log(cyan(`╭${"─".repeat(width)}╮`));
  console.log(positionedRow("", "", title, rightColumn, keyColumn, valueColumn, true));
  console.log(cyan(`├${"─".repeat(width)}┤`));
  for (const [icon, key, value] of rows) {
    console.log(positionedRow(icon!, key!, value!, rightColumn, keyColumn, valueColumn));
  }
  console.log(cyan(`╰${"─".repeat(width)}╯`));
  console.log("");
}

/** Place columns through the terminal itself, avoiding emoji-width guesses. */
function positionedRow(
  icon: string,
  key: string,
  value: string,
  rightColumn: number,
  keyColumn: number,
  valueColumn: number,
  isTitle = false,
): string {
  if (!Deno.stdout.isTerminal()) {
    const plain = isTitle ? value : `${icon}  ${padDisplay(key, valueColumn - 7)}  ${value}`;
    return `│ ${padDisplay(plain, rightColumn - 4)} │`;
  }
  const move = (column: number) => `\x1b[${column}G`;
  if (isTitle) {
    return `${cyan("│")} ${bold(value)}${move(rightColumn)}${cyan("│")}`;
  }
  return `${cyan("│")} ${icon}${move(keyColumn)}${key}${move(valueColumn)}${value}${
    move(rightColumn)
  }${cyan("│")}`;
}

/** Fontconfig's best match; VS Code may still choose differently in Chromium. */
async function matchFont(pattern: string): Promise<string> {
  try {
    const result = await new Deno.Command("fc-match", {
      args: ["-f", "%{family}", pattern],
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
    const matched = new TextDecoder().decode(result.stdout).trim();
    return result.success && matched ? `${matched} (fontconfig)` : "not resolved";
  } catch {
    return "fc-match unavailable";
  }
}

/** Terminal columns, not JavaScript string length: emoji occupy two cells. */
function displayWidth(text: string): number {
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text);
  let width = 0;
  for (const { segment } of segments) {
    width += /\p{Extended_Pictographic}/u.test(segment) ? 2 : 1;
  }
  return width;
}

function padDisplay(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - displayWidth(text)))}`;
}

function warn(text: string): void {
  console.error(`${yellow("warn")} ${text}`);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clock(): string {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
