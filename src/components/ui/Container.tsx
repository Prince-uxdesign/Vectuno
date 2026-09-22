import type { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
  /** Widen the container for content that should breathe more than body copy (e.g. the upload zone). */
  wide?: boolean;
  className?: string;
}

export function Container({ children, wide, className = "" }: ContainerProps) {
  return <div className={`container${wide ? " container--wide" : ""} ${className}`.trim()}>{children}</div>;
}
