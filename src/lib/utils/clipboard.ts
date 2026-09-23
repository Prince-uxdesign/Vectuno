// Shared clipboard helper: async Clipboard API with a textarea/execCommand
// fallback for non-secure contexts and older browsers. Returns true when the
// text is on the clipboard, false when both mechanisms failed so callers can
// show a recovery hint instead of pretending the copy worked.

export function copyViaTextarea(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  textarea.remove();
  return succeeded;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback below.
  }
  try {
    return copyViaTextarea(text);
  } catch {
    return false;
  }
}
