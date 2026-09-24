import { useEffect, useRef } from "react";
import type { DevicePlatform } from "../lib/usePwaInstall";
import { Button } from "./ui/Button";

interface PwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAppDownloaded: boolean;
  platform: DevicePlatform;
}

export function PwaInstallModal({
  isOpen,
  onClose,
  isAppDownloaded,
  platform,
}: PwaInstallModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    // Fallback for light-dismiss on click outside dialog content
    const handleClick = (e: MouseEvent) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!inDialog) {
        onClose();
      }
    };

    dialog.addEventListener("cancel", handleCancel);
    dialog.addEventListener("click", handleClick);

    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      dialog.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="pwa-dialog"
      aria-labelledby="pwa-dialog-title"
    >
      <div className="pwa-dialog__card">
        <header className="pwa-dialog__header">
          <div className="pwa-dialog__icon-wrapper" aria-hidden="true">
            <img
              src={`${import.meta.env.BASE_URL}favicon.svg`}
              alt=""
              width="28"
              height="27"
              className="pwa-dialog__icon"
            />
          </div>
          <div className="pwa-dialog__titles">
            <h2 id="pwa-dialog-title" className="pwa-dialog__title">
              {isAppDownloaded ? "Vectuno is on your device" : "Download Vectuno"}
            </h2>
            <p className="pwa-dialog__sub">
              {isAppDownloaded
                ? "Installed and ready for offline use"
                : "Convert unlimited images directly on your CPU"}
            </p>
          </div>
          <button
            type="button"
            className="pwa-dialog__close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </header>

        <div className="pwa-dialog__body">
          {isAppDownloaded ? (
            <div className="pwa-dialog__installed-info">
              <p>
                You already downloaded Vectuno on this device. You can launch it anytime directly from your:
              </p>
              <ul className="pwa-dialog__steps">
                {platform === "ios" ? (
                  <li>📱 <strong>Home Screen</strong> icon on your iPhone / iPad</li>
                ) : platform === "mac" ? (
                  <li>🖥️ <strong>Applications folder, Launchpad, or Dock</strong> on your Mac</li>
                ) : platform === "android" ? (
                  <li>📱 <strong>App drawer or Home screen</strong> on your phone</li>
                ) : (
                  <li>💻 <strong>Desktop, Start menu, or Taskbar</strong></li>
                )}
              </ul>
              <div className="pwa-dialog__perks">
                <span>⚡ Runs locally on your device</span>
                <span>🔒 Zero image uploads</span>
                <span>✈️ 100% offline support</span>
              </div>
            </div>
          ) : (
            <div className="pwa-dialog__instructions">
              <p className="pwa-dialog__lead">
                Install Vectuno as a standalone app on your {platform === "ios" ? "iPhone/iPad" : platform === "mac" ? "Mac" : platform === "android" ? "Android device" : "computer"}:
              </p>

              {platform === "ios" && (
                <ol className="pwa-dialog__steps">
                  <li>
                    Tap the <strong>Share button</strong>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 4px' }}>
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                    in Safari’s bottom toolbar.
                  </li>
                  <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong> in the top-right corner.</li>
                </ol>
              )}

              {platform === "mac" && (
                <ol className="pwa-dialog__steps">
                  <li>In the top menu bar of Safari, click <strong>File</strong>.</li>
                  <li>Click <strong>Add to Dock...</strong></li>
                  <li>Click <strong>Add</strong> to install Vectuno as a native Mac app.</li>
                </ol>
              )}

              {platform === "android" && (
                <ol className="pwa-dialog__steps">
                  <li>Tap the <strong>three dots</strong> (⋮) in Chrome’s top corner.</li>
                  <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                  <li>Confirm by tapping <strong>Install</strong>.</li>
                </ol>
              )}

              {platform === "desktop" && (
                <ol className="pwa-dialog__steps">
                  <li>
                    Look at the right side of your browser address bar at the top.
                  </li>
                  <li>
                    Click the <strong>Install</strong> icon
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline', verticalAlign: 'middle', margin: '0 4px' }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    or desktop prompt.
                  </li>
                  <li>Click <strong>Install</strong> to add Vectuno to your system.</li>
                </ol>
              )}

              <div className="pwa-dialog__perks">
                <span>⚡ Runs locally on your device</span>
                <span>🔒 Zero image uploads</span>
                <span>✈️ 100% offline support</span>
              </div>
            </div>
          )}
        </div>

        <footer className="pwa-dialog__footer">
          <Button variant="primary" onClick={onClose} style={{ minWidth: 120 }}>
            Got it
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
