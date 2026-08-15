import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { discoverScripts, launchCommand, parseScriptYaml } from "../scripts.ts";

const BASE = `version: 2
name: Test script
entry: run.sh
language: bash
`;

Deno.test("v2 metadata applies visual and runtime defaults", () => {
  const meta = parseScriptYaml(BASE, "examples/test");
  assertEquals(meta.icon, "mdi:console");
  assertEquals(meta.color, "#6fd6c4");
  assertEquals(meta.tags, []);
  assertEquals(meta.instances, "multiple");
  assertEquals(launchCommand(meta), ["bash", "run.sh"]);
});

Deno.test("metadata validates version, language, color, policy, and terminal size", () => {
  for (
    const text of [
      BASE.replace("version: 2", "version: 1"),
      BASE.replace("language: bash", "language: ruby"),
      `${BASE}color: red\n`,
      `${BASE}instances: singleton\n`,
      `${BASE}terminal:\n  width: 20\n`,
    ]
  ) {
    try {
      parseScriptYaml(text);
      throw new Error("expected validation error");
    } catch (error) {
      if (error instanceof Error && error.message === "expected validation error") throw error;
    }
  }
});

Deno.test("custom command and args override the language launcher", () => {
  const meta = parseScriptYaml(`${BASE}command: custom-runner\nargs: [--fast, run.sh]\n`);
  assertEquals(launchCommand(meta), ["custom-runner", "--fast", "run.sh"]);
});

Deno.test("language launchers cover the supported runtimes", () => {
  const expected = {
    bash: ["bash", "run.sh"],
    zsh: ["zsh", "run.sh"],
    python: ["uv", "run", "run.sh"],
    javascript: ["deno", "run", "-A", "run.sh"],
    deno: ["deno", "run", "-A", "run.sh"],
    bun: ["bun", "run", "run.sh"],
    applescript: ["osascript", "run.sh"],
    swift: ["swift", "run.sh"],
  };
  for (const [language, command] of Object.entries(expected)) {
    assertEquals(
      launchCommand(parseScriptYaml(BASE.replace("language: bash", `language: ${language}`))),
      command,
    );
  }
});

Deno.test("recursive discovery returns valid scripts and diagnoses invalid markers", async () => {
  const root = await Deno.makeTempDir();
  try {
    const valid = join(root, "nested", "valid");
    const invalid = join(root, "invalid");
    await Deno.mkdir(valid, { recursive: true });
    await Deno.mkdir(invalid);
    await Deno.writeTextFile(join(valid, "_script.yaml"), BASE);
    await Deno.writeTextFile(join(valid, "run.sh"), "echo ok\n");
    await Deno.writeTextFile(
      join(invalid, "_script.yaml"),
      "version: 2\nname: Broken\nlanguage: bash\n",
    );
    const catalog = await discoverScripts(new URL(`file://${root}/`));
    assertEquals(catalog.scripts.map((script) => script.id), ["nested/valid"]);
    assertEquals(catalog.diagnostics.length, 1);
    assertStringIncludes(catalog.diagnostics[0]!.message, "entry");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("discovery rejects entry path traversal", async () => {
  const root = await Deno.makeTempDir();
  try {
    const dir = join(root, "escape");
    await Deno.mkdir(dir);
    await Deno.writeTextFile(join(root, "outside.sh"), "echo nope\n");
    await Deno.writeTextFile(join(dir, "_script.yaml"), BASE.replace("run.sh", "../outside.sh"));
    const catalog = await discoverScripts(new URL(`file://${root}/`));
    assertEquals(catalog.scripts, []);
    assertStringIncludes(catalog.diagnostics[0]!.message, "inside");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("missing discovery root is an empty catalog", async () => {
  const root = new URL(`file:///tmp/script-runner-${crypto.randomUUID()}/`);
  await assertRejects(() => Deno.stat(root));
  assertEquals(await discoverScripts(root), { scripts: [], diagnostics: [] });
});
