import { fromFileUrl, join, relative, resolve } from "@std/path";

export type OutputFile = {
  path: string;
  name: string;
  folder: string;
  size: number;
  mtime: string;
};

function rootPath(root: URL): string {
  return resolve(fromFileUrl(root));
}

export async function listOutputFiles(root: URL): Promise<OutputFile[]> {
  const base = rootPath(root);
  const files: OutputFile[] = [];

  async function walk(dir: string): Promise<void> {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory) {
        await walk(full);
        continue;
      }
      if (!entry.isFile) continue;
      const info = await Deno.stat(full);
      const rel = relative(base, full).split("\\").join("/");
      const slash = rel.lastIndexOf("/");
      files.push({
        path: rel,
        name: slash === -1 ? rel : rel.slice(slash + 1),
        folder: slash === -1 ? "" : rel.slice(0, slash),
        size: info.size,
        mtime: (info.mtime ?? new Date(0)).toISOString(),
      });
    }
  }

  try {
    await walk(base);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** Resolve a relative path under outputRoot. Returns null if unsafe or missing. */
export function resolveOutputFile(root: URL, relativePath: string): string | null {
  if (!relativePath || relativePath.includes("\0") || relativePath.startsWith("/")) {
    return null;
  }
  if (relativePath.split(/[/\\]/).some((part) => part === ".." || part.startsWith("."))) {
    return null;
  }
  const base = rootPath(root);
  const full = resolve(base, relativePath);
  if (full !== base && !full.startsWith(base + "/") && !full.startsWith(base + "\\")) {
    return null;
  }
  return full;
}

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
  };
  return types[ext] ?? "application/octet-stream";
}
