import { useEffect, useState } from "react";
import { DESIGN_FACTS, type DesignFact } from "../data/designFacts";

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Cycles through a shuffled, non-repeating order of design facts for as long
// as the caller is mounted — intended to be mounted only while a conversion
// is actually running, so the interval starts and stops with the component
// itself (no separate "is this still relevant" bookkeeping needed).
interface FactSequence {
  order: DesignFact[];
  index: number;
}

export function useRotatingFact(intervalMs = 5000): DesignFact {
  const [sequence, setSequence] = useState<FactSequence>(() => ({ order: shuffled(DESIGN_FACTS), index: 0 }));

  useEffect(() => {
    const id = window.setInterval(() => {
      setSequence((prev) => {
        const nextIndex = prev.index + 1;
        // Reshuffle once the current pass is exhausted so facts don't repeat
        // within a pass, without ever showing the same fact twice in a row.
        return nextIndex >= prev.order.length ? { order: shuffled(DESIGN_FACTS), index: 0 } : { ...prev, index: nextIndex };
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return sequence.order[sequence.index];
}
