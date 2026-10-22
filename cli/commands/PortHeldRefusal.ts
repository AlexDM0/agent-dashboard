import { type ServerPortRole } from '../../src/services/DashboardServer.ts';
import { CommandRefusal }      from '../CommandRefusal.ts';

export function portHeldRefusalFor(port: number, role: ServerPortRole = 'dashboard'): CommandRefusal {
  // The board port may be held by another dashboard's own port, so it is not called something else.
  if (role === 'board') return new CommandRefusal(`Port ${port} on 127.0.0.1, where the board pages are served one above --port, is already held; choose another with --port <n>.`);
  return new CommandRefusal(`Port ${port} on 127.0.0.1 is held by something that is not the dashboard; choose another with --port <n>.`);
}
