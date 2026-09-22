import type { ErrorRecovery } from "../types";

interface ErrorStateProps {
  message: string;
  recovery: ErrorRecovery;
  onRetry: () => void;
  onChooseNew: () => void;
}

export function ErrorState({ message, recovery, onRetry, onChooseNew }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <p className="error-state__message">{message}</p>
      <div className="error-state__actions">
        {recovery === "retry" && (
          <button type="button" className="app-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="app-secondary" onClick={onChooseNew}>
          Choose a different image
        </button>
      </div>
    </div>
  );
}
