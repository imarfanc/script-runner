#!/usr/bin/env -S deno run -A
import { fail, heading, info, ok, table, todo, type Row } from "../../../shared/script-output.ts";

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

async function capture(command: string, args: string[]): Promise<string | null> {
  try {
    const { code, stdout } = await new Deno.Command(command, {
      args,
      stdin: "null",
      stdout: "piped",
      stderr: "null",
    }).output();
    return code === 0 ? new TextDecoder().decode(stdout).trim() : null;
  } catch {
    return null;
  }
}

function parseVersions(output: string | null): { name: string; version: string }[] {
  if (!output) return [];
  return output.split("\n").filter(Boolean).map((line) => {
    const [name, ...versions] = line.split(/\s+/);
    return { name: name ?? line, version: versions[0] ?? "?" };
  });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\.app$/, "").replace(/@.*$/, "").replace(/[^a-z0-9]/g, "");
}

interface Cask {
  token: string;
  version: string;
  apps: string[];
  names: string[];
}

async function readCasks(brew: string): Promise<Cask[]> {
  const listed = parseVersions(await capture(brew, ["list", "--cask", "--versions"]));
  if (listed.length === 0) return [];
  const json = await capture(brew, [
    "info",
    "--json=v2",
    "--cask",
    ...listed.map(({ name }) => name),
  ]);
  if (!json) return listed.map(({ name, version }) => ({ token: name, version, apps: [], names: [] }));

  try {
    const parsed = JSON.parse(json) as {
      casks?: {
        token?: string;
        name?: string[];
        installed?: string;
        artifacts?: Record<string, unknown>[];
      }[];
    };
    const byToken = new Map(listed.map((item) => [item.name, item.version]));
    return (parsed.casks ?? []).map((cask) => {
      const token = cask.token ?? "?";
      const apps = (cask.artifacts ?? []).flatMap((artifact) =>
        Array.isArray(artifact.app) ? artifact.app : []
      ).filter((entry): entry is string => typeof entry === "string");
      return {
        token,
        version: byToken.get(token) ?? cask.installed ?? "?",
        apps,
        names: cask.name ?? [],
      };
    });
  } catch {
    return listed.map(({ name, version }) => ({ token: name, version, apps: [], names: [] }));
  }
}

async function inBatches<In, Out>(
  items: In[],
  size: number,
  work: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...await Promise.all(items.slice(index, index + size).map(work)));
  }
  return results;
}

async function bundleVersion(app: string): Promise<string | null> {
  const plist = `/Applications/${app}/Contents/Info.plist`;
  if (!exists(plist)) return null;
  const raw = await capture("/usr/bin/plutil", [
    "-extract",
    "CFBundleShortVersionString",
    "raw",
    "-o",
    "-",
    plist,
  ]);
  return raw && raw !== "<stdin>" ? raw.split("\n")[0]! : null;
}

const brew = findBrew();
if (!brew) {
  heading("Homebrew");
  fail("brew was not found on PATH or in either standard prefix");
  info("Only the /Applications listing can be filled in without it.");
}

const formulae = brew ? parseVersions(await capture(brew, ["list", "--formula", "--versions"])) : [];
const casks = brew ? await readCasks(brew) : [];

heading(`Formulae (${formulae.length})`);
if (formulae.length === 0) info(brew ? "none installed" : "unknown without brew");
else {
  const rows: Row[] = formulae.map(({ name, version }) => {
    const path = which(name);
    return [
      name,
      { text: version, color: "dim" },
      path ? { text: path, color: "green" } : { text: "not on PATH", color: "amber" },
    ];
  });
  table(["Formula", "Version", "Command"], rows);
  const unreachable = rows.filter((row) => (row[2] as { text: string }).text === "not on PATH");
  if (unreachable.length > 0) todo(`${unreachable.length} formula(e) install no command of their own name`);
}

heading(`Casks (${casks.length})`);
if (casks.length === 0) info(brew ? "none installed" : "unknown without brew");
else table(["Cask", "Version"], casks.map(({ token, version }) => [token, { text: version, color: "dim" }]));

const caskApps = new Set(casks.flatMap(({ apps }) => apps.map((app) => app.toLowerCase())));
const caskAliases = new Set(casks.flatMap(({ token, names }) => [token, ...names].map(normalize)));
let apps: string[] = [];
try {
  apps = [...Deno.readDirSync("/Applications")].map((entry) => entry.name).filter((name) =>
    name.endsWith(".app")
  ).sort((left, right) => left.localeCompare(right));
} catch {
  fail("/Applications could not be read");
}

if (apps.length === 0) {
  heading("Applications (0)");
  info("nothing to list");
} else {
  const versions = await inBatches(apps, 12, bundleVersion);
  const managed: Row[] = [];
  const manual: Row[] = [];
  apps.forEach((app, index) => {
    const name = app.replace(/\.app$/, "");
    const row: Row = [name, { text: versions[index] ?? "—", color: "dim" }];
    const known = caskApps.has(app.toLowerCase()) || caskAliases.has(normalize(name));
    (known ? managed : manual).push(row);
  });
  heading(`Applications · cask (${managed.length})`);
  managed.length ? table(["Application", "Version"], managed) : info("no application comes from a cask");
  heading(`Applications · manual (${manual.length})`);
  manual.length ? table(["Application", "Version"], manual) : info("every application is managed by a cask");
  console.log("");
  if (manual.length === 0) ok(`all ${apps.length} applications are managed by a cask`);
  else {
    todo(`${manual.length} of ${apps.length} applications are not managed by a cask`);
    info("nothing will update those but you");
  }
}
