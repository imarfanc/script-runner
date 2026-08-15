import { assertEquals, assertStringIncludes } from "@std/assert";
import { handler } from "../server.ts";

Deno.test("catalog exposes scripts, diagnostics, and client configuration", async () => {
  const response = await handler(new Request("http://local/api/catalog"));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(Array.isArray(body.scripts), true);
  assertEquals(Array.isArray(body.diagnostics), true);
  assertEquals(typeof body.config.columnWidths.scripts, "number");
  assertEquals(body.config.columnWidths.workspace, "auto");
});

Deno.test("script files list the entry first and the marker last", async () => {
  const catalog = await (await handler(new Request("http://local/api/catalog"))).json();
  const script = catalog.scripts[0];
  if (!script) return;
  const response = await handler(
    new Request(`http://local/api/scripts/${script.id}/files`),
  );
  assertEquals(response.status, 200);
  const { files } = await response.json();
  assertEquals(files[0].name, script.entry);
  assertEquals(files.at(-1).name, "_script.yaml");
  assertEquals(typeof files[0].text, "string");
});

Deno.test("files for an unknown script are 404", async () => {
  const response = await handler(new Request("http://local/api/scripts/nope/there/files"));
  assertEquals(response.status, 404);
});

Deno.test("opening a file the script does not own is refused", async () => {
  const catalog = await (await handler(new Request("http://local/api/catalog"))).json();
  const script = catalog.scripts[0];
  if (!script) return;
  const response = await handler(
    new Request(`http://local/api/scripts/${script.id}/open`, {
      method: "POST",
      body: JSON.stringify({ file: "../../../etc/hosts" }),
    }),
  );
  assertEquals(response.status, 400);
});

Deno.test("opening a file for an unknown script is 404", async () => {
  const response = await handler(
    new Request("http://local/api/scripts/nope/there/open", { method: "POST" }),
  );
  assertEquals(response.status, 404);
});

Deno.test("static app has the three major columns and Iconify CDN", async () => {
  const response = await handler(new Request("http://local/"));
  const html = await response.text();
  assertStringIncludes(html, 'id="facet-column"');
  assertStringIncludes(html, 'id="script-column"');
  assertStringIncludes(html, 'id="workspace-column"');
  assertStringIncludes(html, "cdnjs.cloudflare.com/ajax/libs/iconify/3.1.1/iconify.min.js");
});

Deno.test("run API validates its request", async () => {
  const response = await handler(
    new Request("http://local/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
  );
  assertEquals(response.status, 400);
});
