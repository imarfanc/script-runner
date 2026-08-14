import { fromFileUrl, join } from "@std/path";
import { config } from "./config.ts";
import { resolveOutputFile } from "./files.ts";
import type { Job, JobStore } from "./jobs.ts";

export type Scheduler = {
  start: () => void;
  stop: () => void;
  stopRunning: () => void;
};

async function listSwiftSources(dir: string): Promise<string[]> {
  const sources: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.isFile && entry.name.endsWith(".swift")) {
      sources.push(join(dir, entry.name));
    }
  }
  sources.sort();
  return sources;
}

async function ensureSenderBinary(): Promise<string> {
  const senderDir = fromFileUrl(config.senderDir);
  const buildDir = fromFileUrl(config.senderBuildDir);
  await Deno.mkdir(buildDir, { recursive: true });
  const binary = join(buildDir, "send");
  const sources = await listSwiftSources(senderDir);
  if (!sources.length) throw new Error("No Swift sources in data/whatsapp");

  let needsBuild = true;
  try {
    const binStat = await Deno.stat(binary);
    needsBuild = false;
    for (const source of sources) {
      const sourceStat = await Deno.stat(source);
      if ((sourceStat.mtime?.getTime() ?? 0) > (binStat.mtime?.getTime() ?? 0)) {
        needsBuild = true;
        break;
      }
    }
  } catch {
    needsBuild = true;
  }

  if (!needsBuild) return binary;

  const compile = await new Deno.Command("swiftc", {
    args: ["-o", binary, ...sources],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!compile.success) {
    const stderr = new TextDecoder().decode(compile.stderr).trim();
    throw new Error(stderr || "swiftc failed");
  }
  return binary;
}

export function createScheduler(store: JobStore): Scheduler {
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;
  let currentChild: Deno.ChildProcess | undefined;

  async function runJob(job: Job): Promise<void> {
    const startedAt = new Date().toISOString();
    await store.update(job.id, {
      status: "running",
      startedAt,
      finishedAt: null,
      error: null,
      log: "",
    });

    await Deno.mkdir(config.payloadsDir, { recursive: true });
    const payloadPath = new URL(`${job.id}.json`, config.payloadsDir);
    const absoluteFile = job.file ? resolveOutputFile(config.outputRoot, job.file) : null;
    if (job.file && !absoluteFile) {
      await store.update(job.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: `Attachment not found: ${job.file}`,
        log: `Error: Attachment not found: ${job.file}\n`,
      });
      return;
    }

    const payload = {
      chat: job.groupName,
      message: job.message,
      file: absoluteFile ?? "",
    };
    await Deno.writeTextFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`);

    let binary: string;
    try {
      binary = await ensureSenderBinary();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.update(job.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: `Could not build sender: ${message}`,
        log: `Error: Could not build sender: ${message}\n`,
      });
      try {
        await Deno.remove(payloadPath);
      } catch { /* ignore */ }
      return;
    }

    const payloadFile = fromFileUrl(payloadPath);
    let child: Deno.ChildProcess;
    try {
      child = new Deno.Command(binary, {
        args: [payloadFile],
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
      }).spawn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await store.update(job.id, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: `Could not launch sender: ${message}`,
        log: `Error: Could not launch sender: ${message}\n`,
      });
      try {
        await Deno.remove(payloadPath);
      } catch { /* ignore */ }
      return;
    }

    currentChild = child;
    const decoder = new TextDecoder();
    let log = "";

    const pump = async (source: ReadableStream<Uint8Array>) => {
      const reader = source.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = decoder.decode(value);
        log += chunk;
        await store.appendLog(job.id, chunk);
      }
    };

    try {
      await Promise.all([pump(child.stdout), pump(child.stderr)]);
      const { code } = await child.status;
      const finishedAt = new Date().toISOString();
      if (code === 0) {
        await store.update(job.id, {
          status: "sent",
          finishedAt,
          error: null,
          log: `${log}\n── exit ${code} ──\n`,
        });
      } else {
        const errorLine = log.trim().split("\n").findLast((line) => line.startsWith("Error:")) ??
          `sender exited with code ${code}`;
        await store.update(job.id, {
          status: "failed",
          finishedAt,
          error: errorLine.replace(/^Error:\s*/, ""),
          log: `${log}\n── exit ${code} ──\n`,
        });
      }
    } finally {
      currentChild = undefined;
      try {
        await Deno.remove(payloadPath);
      } catch { /* ignore */ }
    }
  }

  async function tick(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      const due = await store.duePending();
      const next = due[0];
      if (!next) return;
      await runJob(next);
    } finally {
      busy = false;
    }
  }

  return {
    start() {
      if (timer !== undefined) return;
      timer = setInterval(() => {
        void tick();
      }, 1000);
      void tick();
    },
    stop() {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
    stopRunning() {
      if (!currentChild) return;
      try {
        currentChild.kill("SIGTERM");
      } catch { /* exited */ }
    },
  };
}
