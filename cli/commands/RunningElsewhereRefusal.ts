import { CommandRefusal } from '../CommandRefusal.ts';

export function runningElsewhereRefusalFor(runningUrl: string, requestedPort: number): CommandRefusal {
  return new CommandRefusal(
    `The dashboard server already runs at ${runningUrl}; stop it with agent-dashboard stop before starting one on port ${requestedPort}.`,
  );
}
