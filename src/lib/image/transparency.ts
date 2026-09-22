// Scans the alpha channel only (every 4th byte) and bails out on the first
// non-opaque pixel — cheap even at the 2000px-longest-side processing cap
// (DEFAULT_MAX_PROCESS_DIMENSION), and almost always short-circuits fast on
// fully opaque photos/JPEGs.
export function hasTransparency(imageData: ImageData): boolean {
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}
