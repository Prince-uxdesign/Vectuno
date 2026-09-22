import type { ErrorRecovery } from "../types";
import { Button } from "./ui/Button";

interface ErrorStateProps {
  message: string;
  recovery: ErrorRecovery;
  onRetry: () => void;
  onChooseNew: () => void;
}

export function ErrorState({ message, recovery, onRetry, onChooseNew }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 8v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.9" fill="currentColor" />
        </svg>
      </span>
      <p className="error-state__message">{message}</p>
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
