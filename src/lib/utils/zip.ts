import { strToU8, zipSync } from "fflate";

export interface ZipEntry {
  name: string;
  content: string;
}

// Zip entries can't share a name, but a batch can genuinely contain two
// source files with the same basename (e.g. from different folders) — dedupe
// the same way most OS file managers do rather than silently overwriting one.
export function uniqueFilenames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf(".");
    return dot === -1 ? `${name} (${count})` : `${name.slice(0, dot)} (${count})${name.slice(dot)}`;
  });
}

export function createZipBlob(entries: ZipEntry[]): Blob {
  const names = uniqueFilenames(entries.map((entry) => entry.name));
  const files: Record<string, Uint8Array> = {};
  entries.forEach((entry, i) => {
    files[names[i]] = strToU8(entry.content);
  });
  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped], { type: "application/zip" });
}
