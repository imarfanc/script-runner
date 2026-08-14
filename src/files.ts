import { fromFileUrl, join, relative, resolve } from "@std/path";

export type OutputFile = {
  path: string;
  name: string;
  folder: string;
  size: number;
  mtime: string;
};

export const CHOSEN_PREFIX = "chosen/";

function rootPath(root: URL): string {
  return resolve(fromFileUrl(root));
}

export async function listOutputFiles(root: URL, folderPrefix = ""): Promise<OutputFile[]> {
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
      const name = slash === -1 ? rel : rel.slice(slash + 1);
      const folder = slash === -1 ? "" : rel.slice(0, slash);
      const displayFolder = folderPrefix
        ? (folder ? `${folderPrefix}/${folder}` : folderPrefix)
        : folder;
      files.push({
        path: folderPrefix ? `${folderPrefix}/${rel}` : rel,
        name,
        folder: displayFolder,
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

export async function listAttachmentFiles(
  outputRoot: URL,
  uploadsRoot: URL,
): Promise<OutputFile[]> {
  const [output, chosen] = await Promise.all([
    listOutputFiles(outputRoot),
    listOutputFiles(uploadsRoot, "chosen"),
  ]);
  return [...chosen, ...output];
}

/** Resolve a relative path under a single root. Returns null if unsafe. */
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

/** Resolve an attachment from data/output or chosen/ uploads. */
export function resolveAttachment(
  outputRoot: URL,
  uploadsRoot: URL,
  relativePath: string,
): string | null {
  if (relativePath.startsWith(CHOSEN_PREFIX)) {
    return resolveOutputFile(uploadsRoot, relativePath.slice(CHOSEN_PREFIX.length));
  }
  return resolveOutputFile(outputRoot, relativePath);
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

export function safeUploadName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.trim() || "file";
  const cleaned = base.replace(/[^\w.\-+() ]+/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "file";
}
