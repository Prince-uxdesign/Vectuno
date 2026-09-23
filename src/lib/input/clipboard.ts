// Turns whatever the browser exposes on a paste/drop into plain File objects
// so every input method can feed the same pipeline (validate → decode →
// preview). Nothing here converts or validates images.

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Clipboard images arrive as an anonymous "image.png" (or with no usable
// name at all). Give them a distinct, sortable name so downloads become
// e.g. "pasted-image-20260923-101530.svg" rather than "image.svg".
function nameForPastedFile(file: File, index: number): string {
  const hasRealName = file.name && !/^image\.[a-z0-9]+$/i.test(file.name);
  if (hasRealName) return file.name;
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const ext = EXTENSION_BY_MIME[file.type];
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `pasted-image-${stamp}${suffix}${ext ? `.${ext}` : ""}`;
}

export function getFilesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  // Some browsers only populate `files`, not `items`.
  if (files.length === 0) files.push(...Array.from(data.files ?? []));

  return files.map((file, i) => {
    const name = nameForPastedFile(file, i);
    return name === file.name ? file : new File([file], name, { type: file.type, lastModified: Date.now() });
  });
}

export function dataTransferHasFiles(data: DataTransfer | null): boolean {
  if (!data) return false;
  return Array.from(data.types ?? []).includes("Files");
}
