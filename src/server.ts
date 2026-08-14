import { config } from "./config.ts";
import { contentTypeFor, listOutputFiles, resolveOutputFile } from "./files.ts";
import { loadGroups } from "./groups.ts";
import { JobStore } from "./jobs.ts";
import { createScheduler, type Scheduler } from "./scheduler.ts";

const PUBLIC = new URL("../public/", import.meta.url);
const store = new JobStore(config.jobsPath);
const scheduler: Scheduler = createScheduler(store);
let ready: Promise<void> | undefined;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = store.load();
  }
  await ready;
  scheduler.start();
}

async function appPayload(): Promise<Response> {
  const [groups, files, jobs] = await Promise.all([
    loadGroups(config.groupsPath),
    listOutputFiles(config.outputRoot),
    store.list(),
  ]);
  return json({
    groups,
    files,
    jobs,
    config: { title: config.title, favicon: config.favicon },
  });
}

async function createJob(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as {
    groupName?: unknown;
    message?: unknown;
    file?: unknown;
    sendAt?: unknown;
  } | null;

  const groupName = typeof body?.groupName === "string" ? body.groupName.trim() : "";
  const message = typeof body?.message === "string" ? body.message : "";
  const file = typeof body?.file === "string" ? body.file.trim() : "";
  const sendAt = typeof body?.sendAt === "string" ? body.sendAt.trim() : "";

  if (!groupName) return json({ error: "groupName is required" }, 400);
  if (!message.trim() && !file) {
    return json({ error: "message or file is required" }, 400);
  }
  if (!sendAt || Number.isNaN(Date.parse(sendAt))) {
    return json({ error: "sendAt must be a valid ISO datetime" }, 400);
  }

  const groups = await loadGroups(config.groupsPath);
  if (!groups.some((group) => group.name === groupName)) {
    return json({ error: "Unknown group" }, 400);
  }

  if (file) {
    const absolute = resolveOutputFile(config.outputRoot, file);
    if (!absolute) return json({ error: "Invalid file path" }, 400);
    try {
      const info = await Deno.stat(absolute);
      if (!info.isFile) return json({ error: "File not found" }, 400);
    } catch {
      return json({ error: "File not found" }, 400);
    }
  }

  const job = await store.create({ groupName, message, file, sendAt });
  return json(job, 201);
}

async function cancelJob(id: string): Promise<Response> {
  const existing = await store.get(id);
  if (!existing) return json({ error: "Job not found" }, 404);
  if (existing.status !== "pending") {
    return json({ error: "Only pending jobs can be canceled", job: existing }, 409);
  }
  const job = await store.cancel(id);
  return json(job);
}

async function serveOutputFile(pathname: string): Promise<Response> {
  const relative = decodeURIComponent(pathname.slice("/api/files/".length));
  const absolute = resolveOutputFile(config.outputRoot, relative);
  if (!absolute) return json({ error: "Not found" }, 404);
  try {
    const body = await Deno.readFile(absolute);
    return new Response(body, {
      headers: {
        "content-type": contentTypeFor(absolute),
        "cache-control": "no-store",
      },
    });
  } catch {
    return json({ error: "Not found" }, 404);
  }
}

async function staticFile(pathname: string): Promise<Response> {
  const name = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!/^[\w./-]+$/.test(name) || name.includes("..")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const body = await Deno.readFile(new URL(name, PUBLIC));
    const ext = name.slice(name.lastIndexOf("."));
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
    };
    return new Response(body, {
      headers: { "content-type": `${types[ext] ?? "application/octet-stream"}; charset=utf-8` },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

export async function handler(request: Request): Promise<Response> {
  await ensureReady();
  const { pathname } = new URL(request.url);

  if (pathname === "/api/app" && request.method === "GET") return await appPayload();
  if (pathname === "/api/jobs" && request.method === "GET") return json(await store.list());
  if (pathname === "/api/jobs" && request.method === "POST") return await createJob(request);

  const jobMatch = pathname.match(/^\/api\/jobs\/([\w-]+)$/);
  if (jobMatch && request.method === "DELETE") return await cancelJob(jobMatch[1]!);

  if (pathname.startsWith("/api/files/") && request.method === "GET") {
    return await serveOutputFile(pathname);
  }

  if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
  return await staticFile(pathname);
}

export function stopAll(): void {
  scheduler.stop();
  scheduler.stopRunning();
}
