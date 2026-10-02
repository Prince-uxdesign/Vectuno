import type { AcceptedMimeType } from "../../types";

// Identifies the real image format from the file's leading bytes. The file
// name and declared MIME are user/OS-supplied and easy to get wrong (a JPEG
// renamed .png, a paste with no type), so content is the source of truth.
export async function sniffImageType(file: Blob): Promise<AcceptedMimeType | null> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return null;
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // "RIFF" <4-byte size> "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// Whether the file's pixels went through lossy compression. JPEG always does
// and PNG never does; WebP can be either, told apart by its image chunk:
// "VP8 " is lossy, "VP8L" lossless (an extended "VP8X" file lists other
// chunks first, so the chunk list is walked). Unknown -> assume lossy.
export async function isLossyEncoding(file: Blob, mime: AcceptedMimeType): Promise<boolean> {
  if (mime === "image/png") return false;
  if (mime === "image/jpeg") return true;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.slice(0, 65_536).arrayBuffer());
  } catch {
    return true;
  }
  const fourcc = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = fourcc(at);
    if (id === "VP8L") return false;
    if (id === "VP8 ") return true;
    const size = bytes[at + 4] | (bytes[at + 5] << 8) | (bytes[at + 6] << 16) | (bytes[at + 7] << 24);
    if (size < 0) break;
    at += 8 + size + (size & 1);
  }
  return true;
}
