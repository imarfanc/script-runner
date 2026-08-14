import { assertEquals, assertThrows } from "@std/assert";
import { join, toFileUrl } from "@std/path";
import { listOutputFiles, resolveOutputFile } from "./files.ts";
import { parseGroupsYaml } from "./groups.ts";
import { JobStore } from "./jobs.ts";

Deno.test("parseGroupsYaml reads names and optional labels", () => {
  const groups = parseGroupsYaml(`
groups:
  - name: "Alpha"
  - name: "Beta"
    label: "Beta Team"
`);
  assertEquals(groups, [
    { name: "Alpha", label: "Alpha" },
    { name: "Beta", label: "Beta Team" },
  ]);
});

Deno.test("parseGroupsYaml rejects empty names", () => {
  assertThrows(() => parseGroupsYaml(`groups:\n  - name: "  "\n`));
});

Deno.test("listOutputFiles skips dotfiles and returns relative paths", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(root, "imgs"), { recursive: true });
    await Deno.writeTextFile(join(root, "imgs", "a.jpg"), "a");
    await Deno.writeTextFile(join(root, ".hidden"), "x");
    await Deno.writeTextFile(join(root, "imgs", ".DS_Store"), "x");
    const files = await listOutputFiles(toFileUrl(root + "/"));
    assertEquals(files.map((file) => file.path), ["imgs/a.jpg"]);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("resolveOutputFile blocks path traversal", () => {
  const root = toFileUrl("/tmp/whatsapp-output-root/");
  assertEquals(resolveOutputFile(root, "../etc/passwd"), null);
  assertEquals(resolveOutputFile(root, "imgs/../secret"), null);
  assertEquals(resolveOutputFile(root, "/etc/passwd"), null);
});

Deno.test("JobStore create cancel and duePending", async () => {
  const dir = await Deno.makeTempDir();
  const path = toFileUrl(join(dir, "jobs.json"));
  try {
    const store = new JobStore(path);
    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();
    const a = await store.create({
      groupName: "Alpha",
      message: "hi",
      file: "",
      sendAt: future,
    });
    const b = await store.create({
      groupName: "Beta",
      message: "later",
      file: "imgs/a.jpg",
      sendAt: past,
    });
    assertEquals(a.status, "pending");
    const due = await store.duePending();
    assertEquals(due.map((job) => job.id), [b.id]);
    const canceled = await store.cancel(a.id);
    assertEquals(canceled?.status, "canceled");
    const again = await store.cancel(a.id);
    assertEquals(again?.status, "canceled");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
