import { assertEquals, assertStringIncludes } from "@std/assert";
import { handler } from "./server.ts";

Deno.test("catalog exposes scripts, diagnostics, and client configuration", async () => {
  const response = await handler(new Request("http://local/api/catalog"));
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(Array.isArray(body.scripts), true);
  assertEquals(Array.isArray(body.diagnostics), true);
  assertEquals(typeof body.config.columnWidths.workspace, "number");
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
