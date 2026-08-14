import { config } from "./config.ts";
import { discoverScripts, launchCommand, scriptDirectory, type ScriptMeta } from "./scripts.ts";

const PUBLIC = new URL("../public/", import.meta.url);
const running = new Map<string, Deno.ChildProcess>();

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

async function findScript(id: string): Promise<ScriptMeta | undefined> {
  return (await discoverScripts()).scripts.find((script) => script.id === id);
}

async function startRun(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { scriptId?: unknown } | null;
  if (typeof body?.scriptId !== "string") return json({ error: "scriptId is required" }, 400);
  const meta = await findScript(body.scriptId);
  if (!meta) return json({ error: "Script not found" }, 404);
  const [command, ...args] = launchCommand(meta);
  let child: Deno.ChildProcess;
  try {
    child = new Deno.Command(command!, {
      args,
      cwd: scriptDirectory(meta),
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      env: { ...Deno.env.toObject(), ...meta.env, FORCE_COLOR: "1", TERM: "xterm-256color" },
    }).spawn();
  } catch {
    return json({ error: `Could not launch ${command}` }, 500);
  }
  const runId = crypto.randomUUID();
  running.set(runId, child);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (value: Uint8Array) => {
        if (open) {
          try {
            controller.enqueue(value);
          } catch {
            open = false;
          }
        }
      };
      const pump = async (source: ReadableStream<Uint8Array>) => {
        const reader = source.getReader();
        while (open) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) send(value);
        }
      };
      void (async () => {
        try {
          await Promise.all([pump(child.stdout), pump(child.stderr)]);
          const { code } = await child.status;
          send(encoder.encode(`\n\u001b[2m── exit ${code} ──\u001b[0m\n`));
        } finally {
          running.delete(runId);
          open = false;
          try {
            controller.close();
          } catch { /* closed */ }
        }
      })();
    },
    cancel() {
      try {
        child.kill("SIGTERM");
      } catch { /* exited */ }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-run-id": runId,
      "access-control-expose-headers": "x-run-id",
    },
  });
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
  const { pathname } = new URL(request.url);
  if (pathname === "/api/catalog" && request.method === "GET") {
    return json({
      ...(await discoverScripts()),
      config: {
        title: config.title,
        favicon: config.favicon,
        columnWidths: config.columnWidths,
        defaultTerminalSize: config.defaultTerminalSize,
        defaultInstancePolicy: config.defaultInstancePolicy,
      },
    });
  }
  if (pathname === "/api/runs" && request.method === "POST") return await startRun(request);
  const match = pathname.match(/^\/api\/runs\/([\w-]+)$/);
  if (match && request.method === "DELETE") {
    const child = running.get(match[1]!);
    if (!child) return json({ stopped: false }, 404);
    try {
      child.kill("SIGTERM");
    } catch { /* exited */ }
    return json({ stopped: true });
  }
  if (pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
  return await staticFile(pathname);
}

export function stopAll(): void {
  for (const child of running.values()) {
    try {
      child.kill("SIGTERM");
    } catch { /* exited */ }
  }
}
