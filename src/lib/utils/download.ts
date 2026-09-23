export function downloadSvg(svg: string, filename: string): void {
  triggerBlobDownload(new Blob([svg], { type: "image/svg+xml" }), filename);
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Appended to the DOM: required for the download to trigger in some
  // browsers (e.g. Safari ignores clicks on detached anchors).
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delayed: revoking immediately after click() can abort the download in
  // Firefox and for large blobs before the browser has read the data.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
