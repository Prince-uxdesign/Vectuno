import { useEffect, useRef } from "react";
import type { ErrorRecovery } from "../types";
import { Button } from "./ui/Button";

interface ErrorStateProps {
  message: string;
  hint: string;
  recovery: ErrorRecovery;
  onRetry: () => void;
  onChooseNew: () => void;
}

export function ErrorState({ message, hint, recovery, onRetry, onChooseNew }: ErrorStateProps) {
  // The error replaces whatever the user was interacting with (upload zone,
  // Convert button), so focus would otherwise be lost to <body>. Moving it
  // here parks keyboard users on the recovery actions and the role="alert"
  // announces the message to screen readers.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  return (
    <div ref={rootRef} className="error-state" role="alert" tabIndex={-1}>
      <span className="error-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
          <path d="M12 8v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.9" fill="currentColor" />
        </svg>
      </span>
      <p className="error-state__message">{message}</p>
      <p className="error-state__hint">{hint}</p>
      <div className="error-state__actions">
        {recovery === "retry" && (
          <Button variant="primary" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Button variant="secondary" onClick={onChooseNew}>
          Choose a different image
        </Button>
      </div>
    </div>
  );
}
