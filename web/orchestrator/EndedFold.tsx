import type { ReactNode } from 'react';

/** The closed "Ended (N)" section under a session list; nothing at all while no session has ended. */
export function EndedFold({ endedCount, children }: { endedCount: number; children: ReactNode }) {
  if (endedCount === 0) return null;
  return (
    <details className="ap-ended-fold">
      <summary className="ap-ended-fold-summary">Ended ({endedCount})</summary>
      <div className="ap-ended-fold-body">{children}</div>
    </details>
  );
}
