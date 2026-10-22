import { type ServerPortRole } from '../../src/services/DashboardServer.ts';
import { CommandRefusal }      from '../CommandRefusal.ts';

export function portHeldRefusalFor(port: number, role: ServerPortRole = 'dashboard'): CommandRefusal {
  const portName = role === 'board' ? `Port ${port} on 127.0.0.1, where the board pages are served one above --port,` : `Port ${port} on 127.0.0.1`;
  return new CommandRefusal(`${portName} is held by something that is not the dashboard; choose another with --port <n>.`);
}
