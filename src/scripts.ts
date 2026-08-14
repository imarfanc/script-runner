import { parse as parseYaml } from "@std/yaml";
import { isAbsolute, relative, resolve, SEPARATOR } from "@std/path";
import { config, type InstancePolicy } from "./config.ts";

export const LANGUAGES = [
  "bash",
  "zsh",
  "python",
  "javascript",
  "deno",
  "bun",
  "applescript",
  "swift",
] as const;
export type Language = (typeof LANGUAGES)[number];

export interface ScriptMeta {
  id: string;
  version: 2;
  name: string;
  description: string;
  entry: string;
  language: Language;
  icon: string;
  color: string;
  group: string;
  space: string;
  section: string;
  tags: string[];
  instances: InstancePolicy;
  terminal: { width: number; height: number };
  command?: string;
  args?: string[];
  env: Record<string, string>;
}

export interface Diagnostic {
  file: string;
  message: string;
}
export interface Catalog {
  scripts: ScriptMeta[];
  diagnostics: Diagnostic[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("must be a map");
  return value as Record<string, unknown>;
}
function requiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a string`);
  return value.trim();
}
function optionalString(data: Record<string, unknown>, key: string, fallback = ""): string {
  const value = data[key];
  if (value === undefined) return fallback;
  if (typeof value !== "string") throw new Error(`${key} must be a string`);
  return value.trim();
}
function positive(value: unknown, fallback: number, key: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 180) {
    throw new Error(`${key} must be a number of at least 180`);
  }
  return Math.round(value);
}

export function parseScriptYaml(text: string, id = "script"): ScriptMeta {
  const data = record(parseYaml(text));
  if (data.version !== 2) throw new Error("version must be 2");
  const language = requiredString(data, "language");
  if (!(LANGUAGES as readonly string[]).includes(language)) {
    throw new Error(`unsupported language: ${language}`);
  }
  const color = optionalString(data, "color", "#6fd6c4");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("color must be a 6-digit hex value");
  const icon = optionalString(data, "icon", "mdi:console");
  const instances = optionalString(data, "instances", config.defaultInstancePolicy);
  if (!["multiple", "focus", "rerun"].includes(instances)) {
    throw new Error("instances must be multiple, focus, or rerun");
  }
  const tags = data.tags ?? [];
  if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    throw new Error("tags must be an array of non-empty strings");
  }
  const terminal = data.terminal === undefined ? {} : record(data.terminal);
  const args = data.args;
  if (args !== undefined && (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))) {
    throw new Error("args must be an array of strings");
  }
  const envData = data.env === undefined ? {} : record(data.env);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(envData)) {
    if (typeof value !== "string") throw new Error(`env.${key} must be a string`);
    env[key] = value;
  }
  return {
    id,
    version: 2,
    name: requiredString(data, "name"),
    description: optionalString(data, "description"),
    entry: requiredString(data, "entry"),
    language: language as Language,
    icon: /^[\w-]+:[\w-]+$/.test(icon) ? icon : "mdi:console",
    color,
    group: optionalString(data, "group"),
    space: optionalString(data, "space"),
    section: optionalString(data, "section"),
    tags: [...new Set(tags.map((tag) => String(tag).trim()))],
    instances: instances as InstancePolicy,
    terminal: {
      width: positive(terminal.width, config.defaultTerminalSize.width, "terminal.width"),
      height: positive(terminal.height, config.defaultTerminalSize.height, "terminal.height"),
    },
    command: data.command === undefined ? undefined : requiredString(data, "command"),
    args: args as string[] | undefined,
    env,
  };
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== ".." && !rel.startsWith(`..${SEPARATOR}`) && !isAbsolute(rel);
}

async function walk(dir: string, root: string, catalog: Catalog): Promise<void> {
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.startsWith(".")) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory) await walk(path, root, catalog);
    if (!entry.isFile || entry.name !== "_script.yaml") continue;
    const id = relative(root, dir).split(SEPARATOR).join("/");
    try {
      const meta = parseScriptYaml(await Deno.readTextFile(path), id);
      const target = resolve(dir, meta.entry);
      if (!inside(dir, target)) throw new Error("entry must stay inside the script directory");
      const stat = await Deno.stat(target);
      if (!stat.isFile) throw new Error("entry must name a file");
      catalog.scripts.push(meta);
    } catch (error) {
      catalog.diagnostics.push({
        file: relative(root, path),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function discoverScripts(rootUrl = config.scriptsRoot): Promise<Catalog> {
  const root = resolve(rootUrl.pathname);
  const catalog: Catalog = { scripts: [], diagnostics: [] };
  try {
    await walk(root, root, catalog);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  catalog.scripts.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return catalog;
}

export function launchCommand(meta: ScriptMeta): string[] {
  if (meta.command) return [meta.command, ...(meta.args ?? [])];
  const launchers: Record<Language, string[]> = {
    bash: ["bash", meta.entry],
    zsh: ["zsh", meta.entry],
    python: ["uv", "run", meta.entry],
    javascript: ["deno", "run", "-A", meta.entry],
    deno: ["deno", "run", "-A", meta.entry],
    bun: ["bun", "run", meta.entry],
    applescript: ["osascript", meta.entry],
    swift: ["swift", meta.entry],
  };
  return launchers[meta.language];
}

export function scriptDirectory(meta: ScriptMeta): string {
  return resolve(config.scriptsRoot.pathname, meta.id);
}
