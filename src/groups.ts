import { parse } from "@std/yaml";

export type Group = {
  name: string;
  label: string;
};

type GroupsFile = {
  groups?: unknown;
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseGroupsYaml(text: string): Group[] {
  const parsed = parse(text) as GroupsFile | null;
  if (!parsed || !Array.isArray(parsed.groups)) {
    throw new Error("groups.yaml must contain a groups array");
  }

  const groups: Group[] = [];
  for (const entry of parsed.groups) {
    if (!entry || typeof entry !== "object") {
      throw new Error("each group must be an object with a name");
    }
    const record = entry as Record<string, unknown>;
    const name = asString(record.name);
    if (!name) throw new Error("each group needs a non-empty name");
    groups.push({ name, label: asString(record.label) ?? name });
  }
  return groups;
}

export async function loadGroups(path: URL): Promise<Group[]> {
  const text = await Deno.readTextFile(path);
  return parseGroupsYaml(text);
}
