import { Component, type ErrorInfo, type ReactNode } from "react";

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
}

// Last-resort guard so an unexpected render error doesn't leave visitors
// staring at a blank white page with no way forward.
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled error rendering Vectuno:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="root-error-boundary" role="alert">
          <p className="root-error-boundary__message">Something went wrong loading Vectuno.</p>
          <button type="button" className="root-error-boundary__reload" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
