import { CommandRefusal } from '../CommandRefusal.ts';

export function portHeldRefusalFor(port: number): CommandRefusal {
  return new CommandRefusal(`Port ${port} on 127.0.0.1 is held by something that is not the dashboard; choose another with --port <n>.`);
}
