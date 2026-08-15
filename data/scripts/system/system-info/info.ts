#!/usr/bin/env -S deno run -A
/**
 * A snapshot of this machine: what it is, where it is on the network, and which
 * of the tools this repo leans on are installed.
 *
 * Every value is gathered defensively. A missing command, a machine that is not
 * a Mac, or an interface that is down should leave a dash in one cell rather
 * than kill the run — the point of a status script is to still tell you the
 * eleven things that did work.
 */
import { heading, info, type Row, table } from "../../../shared/script-output.ts";

const MISSING = "—";

/** stdout of a command, or "" when it is absent, fails, or writes nothing. */
async function run(command: string, ...args: string[]): Promise<string> {
  try {
    const { success, stdout } = await new Deno.Command(command, {
      args,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
    return success ? new TextDecoder().decode(stdout).trim() : "";
  } catch {
    return "";
  }
}

const sysctl = (key: string) => run("sysctl", "-n", key);

/** Every one of these tools reports `name x.y.z …`; the number is the part we want. */
function semver(text: string): string {
  return text.match(/\d+\.\d+(?:\.\d+)?[\w.+-]*/)?.[0] ?? "";
}

function orMissing(value: string): string {
  return value || MISSING;
}

function gigabytes(bytes: string): string {
  const value = Number(bytes);
  return Number.isFinite(value) && value > 0 ? `${Math.round(value / 1024 ** 3)} GB` : "";
}

/** `{ sec = 1699999999, usec = 1 } …` is what kern.boottime looks like. */
function uptimeFrom(boottime: string): string {
  const seconds = Number(boottime.match(/sec\s*=\s*(\d+)/)?.[1]);
  if (!Number.isFinite(seconds)) return "";
  const elapsed = Date.now() / 1000 - seconds;
  if (elapsed < 0) return "";
  const days = Math.floor(elapsed / 86400);
  const hours = Math.floor((elapsed % 86400) / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

async function systemRows(): Promise<Row[]> {
  const [name, version, build, model, chip, cores, memory, boottime, host, disk] = await Promise.all(
    [
      run("sw_vers", "-productName"),
      run("sw_vers", "-productVersion"),
      run("sw_vers", "-buildVersion"),
      sysctl("hw.model"),
      sysctl("machdep.cpu.brand_string"),
      sysctl("hw.ncpu"),
      sysctl("hw.memsize"),
      sysctl("kern.boottime"),
      run("scutil", "--get", "ComputerName"),
      run("df", "-h", "/"),
    ],
  );

  // df's second line: filesystem, size, used, available, capacity, …
  const [, size, , available] = disk.split("\n")[1]?.split(/\s+/) ?? [];
  const shell = Deno.env.get("SHELL")?.split("/").at(-1) ?? "";

  return [
    ["os", orMissing([name, version].filter(Boolean).join(" ")), build ? `build ${build}` : ""],
    ["model", orMissing(model), ""],
    ["cpu", orMissing(chip), cores ? `${cores} cores` : ""],
    ["memory", orMissing(gigabytes(memory)), ""],
    ["disk", available && size ? `${available} free` : MISSING, size ? `of ${size}` : ""],
    ["uptime", orMissing(uptimeFrom(boottime)), ""],
    ["host", orMissing(host || Deno.hostname()), ""],
    ["user", orMissing(Deno.env.get("USER") ?? ""), shell],
  ].map(([key, value, note]) => [
    { text: key!, color: "dim" as const },
    value!,
    { text: note!, color: "dim" as const },
  ]);
}

/** The interface the default route uses is the one worth reporting first. */
async function networkRows(): Promise<Row[]> {
  const route = await run("route", "-n", "get", "default");
  const primary = route.match(/interface:\s*(\S+)/)?.[1] ?? "";
  const [local, ssid, publicAddress] = await Promise.all([
    primary ? run("ipconfig", "getifaddr", primary) : Promise.resolve(""),
    primary ? run("networksetup", "-getairportnetwork", primary) : Promise.resolve(""),
    publicIp(),
  ]);
  const network = ssid.includes(":") ? ssid.split(":").slice(1).join(":").trim() : "";

  return [
    ["local", orMissing(local), primary ? `via ${primary}` : ""],
    ["public", orMissing(publicAddress), ""],
    ["network", orMissing(network), ""],
  ].map(([key, value, note]) => [
    { text: key!, color: "dim" as const },
    value!,
    { text: note!, color: "dim" as const },
  ]);
}

/** Worth a couple of seconds, never worth hanging the whole report. */
async function publicIp(): Promise<string> {
  try {
    const response = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(2500) });
    return response.ok ? (await response.text()).trim() : "";
  } catch {
    return "";
  }
}

const TOOLS = [
  { name: "brew", install: "see https://brew.sh" },
  { name: "deno", install: "brew install deno" },
  { name: "uv", install: "brew install uv" },
];

async function toolRows(): Promise<Row[]> {
  return await Promise.all(TOOLS.map(async ({ name, install }) => {
    const path = await run("which", name);
    if (!path) {
      return [
        name,
        { text: "not installed", color: "red" as const },
        { text: install, color: "dim" as const },
      ];
    }
    return [
      name,
      { text: orMissing(semver(await run(name, "--version"))), color: "green" as const },
      { text: path, color: "dim" as const },
    ];
  }));
}

if (Deno.build.os !== "darwin") {
  info(`not a Mac (${Deno.build.os}) — most system values will be blank`);
}

heading("System");
table(["property", "value", "detail"], await systemRows());

heading("Network");
table(["property", "value", "detail"], await networkRows());

heading("Tools");
table(["tool", "version", "path"], await toolRows(), 60);

console.log();
