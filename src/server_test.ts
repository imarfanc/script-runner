import { assertEquals, assertStringIncludes } from "@std/assert";
import { config } from "./config.ts";
import { handler, stopAll } from "./server.ts";

async function resetJobsFile(): Promise<void> {
  try {
    await Deno.remove(config.jobsPath);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

Deno.test({
  name: "app API exposes groups, files, jobs, and title",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await resetJobsFile();
    const response = await handler(new Request("http://local/api/app"));
    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(Array.isArray(body.groups), true);
    assertEquals(body.groups.length > 0, true);
    assertEquals(Array.isArray(body.files), true);
    assertEquals(Array.isArray(body.jobs), true);
    assertEquals(body.config.title, "WhatsApp Sender");
    stopAll();
  },
});

Deno.test({
  name: "static app has composer and jobs columns",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const response = await handler(new Request("http://local/"));
    const html = await response.text();
    assertStringIncludes(html, 'id="composer-column"');
    assertStringIncludes(html, 'id="jobs-column"');
    assertStringIncludes(html, 'id="group-select"');
    assertStringIncludes(html, 'id="file-list"');
    assertStringIncludes(html, 'id="send-at"');
    assertStringIncludes(html, 'id="job-log"');
    stopAll();
  },
});

Deno.test({
  name: "job API validates required fields",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await resetJobsFile();
    const response = await handler(
      new Request("http://local/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assertEquals(response.status, 400);
    stopAll();
  },
});

Deno.test({
  name: "job API rejects path traversal for attachments",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await resetJobsFile();
    const app = await (await handler(new Request("http://local/api/app"))).json();
    const groupName = app.groups[0].name as string;
    const response = await handler(
      new Request("http://local/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupName,
          message: "hi",
          file: "../README.md",
          sendAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      }),
    );
    assertEquals(response.status, 400);
    stopAll();
  },
});

Deno.test({
  name: "job API creates and cancels a pending job",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    await resetJobsFile();
    const app = await (await handler(new Request("http://local/api/app"))).json();
    const groupName = app.groups[0].name as string;
    const create = await handler(
      new Request("http://local/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          groupName,
          message: "test message",
          file: "",
          sendAt: new Date(Date.now() + 120_000).toISOString(),
        }),
      }),
    );
    assertEquals(create.status, 201);
    const job = await create.json();
    assertEquals(job.status, "pending");

    const cancel = await handler(
      new Request(`http://local/api/jobs/${job.id}`, { method: "DELETE" }),
    );
    assertEquals(cancel.status, 200);
    const canceled = await cancel.json();
    assertEquals(canceled.status, "canceled");
    await resetJobsFile();
    stopAll();
  },
});

Deno.test({
  name: "files API serves output images and blocks traversal",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const app = await (await handler(new Request("http://local/api/app"))).json();
    const file = app.files[0]?.path as string | undefined;
    assertEquals(typeof file, "string");
    const ok = await handler(new Request(`http://local/api/files/${file}`));
    assertEquals(ok.status, 200);
    assertStringIncludes(ok.headers.get("content-type") ?? "", "image/");

    const bad = await handler(new Request("http://local/api/files/../README.md"));
    assertEquals(bad.status, 404);
    stopAll();
  },
});
