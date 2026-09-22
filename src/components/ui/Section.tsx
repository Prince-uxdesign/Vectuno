import type { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Tighter vertical rhythm for sections stacked closely (e.g. the active workspace). */
  compact?: boolean;
}

export function Section({ children, id, className = "", compact }: SectionProps) {
  return (
    <section id={id} className={`section${compact ? " section--compact" : ""} ${className}`.trim()}>
      {children}
    </section>
  );
}
