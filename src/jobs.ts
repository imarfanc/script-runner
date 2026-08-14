export type JobStatus = "pending" | "running" | "sent" | "failed" | "canceled";

export type Job = {
  id: string;
  groupName: string;
  message: string;
  file: string;
  sendAt: string;
  status: JobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  log: string;
};

export type CreateJobInput = {
  groupName: string;
  message: string;
  file: string;
  sendAt: string;
};

async function readJobsFile(path: URL): Promise<Job[]> {
  try {
    const text = await Deno.readTextFile(path);
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Job[];
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
}

async function writeJobsFile(path: URL, jobs: Job[]): Promise<void> {
  await Deno.mkdir(new URL(".", path), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(jobs, null, 2)}\n`);
}

export class JobStore {
  #path: URL;
  #jobs: Job[] = [];
  #loaded = false;

  constructor(path: URL) {
    this.#path = path;
  }

  async load(): Promise<void> {
    this.#jobs = await readJobsFile(this.#path);
    this.#loaded = true;
  }

  async #ensureLoaded(): Promise<void> {
    if (!this.#loaded) await this.load();
  }

  async #persist(): Promise<void> {
    await writeJobsFile(this.#path, this.#jobs);
  }

  async list(): Promise<Job[]> {
    await this.#ensureLoaded();
    return this.#jobs.map((job) => ({ ...job }));
  }

  async get(id: string): Promise<Job | undefined> {
    await this.#ensureLoaded();
    const job = this.#jobs.find((item) => item.id === id);
    return job ? { ...job } : undefined;
  }

  async create(input: CreateJobInput): Promise<Job> {
    await this.#ensureLoaded();
    const now = new Date().toISOString();
    const job: Job = {
      id: crypto.randomUUID(),
      groupName: input.groupName,
      message: input.message,
      file: input.file,
      sendAt: input.sendAt,
      status: "pending",
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      error: null,
      log: "",
    };
    this.#jobs.unshift(job);
    await this.#persist();
    return { ...job };
  }

  async update(id: string, patch: Partial<Job>): Promise<Job | undefined> {
    await this.#ensureLoaded();
    const index = this.#jobs.findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    const current = this.#jobs[index]!;
    const next = { ...current, ...patch, id: current.id };
    this.#jobs[index] = next;
    await this.#persist();
    return { ...next };
  }

  async cancel(id: string): Promise<Job | undefined> {
    await this.#ensureLoaded();
    const job = this.#jobs.find((item) => item.id === id);
    if (!job) return undefined;
    if (job.status !== "pending") return { ...job };
    return await this.update(id, {
      status: "canceled",
      finishedAt: new Date().toISOString(),
    });
  }

  async duePending(now = Date.now()): Promise<Job[]> {
    await this.#ensureLoaded();
    return this.#jobs
      .filter((job) => job.status === "pending" && Date.parse(job.sendAt) <= now)
      .sort((a, b) => Date.parse(a.sendAt) - Date.parse(b.sendAt))
      .map((job) => ({ ...job }));
  }

  async appendLog(id: string, chunk: string): Promise<void> {
    await this.#ensureLoaded();
    const job = this.#jobs.find((item) => item.id === id);
    if (!job) return;
    job.log += chunk;
    await this.#persist();
  }
}
