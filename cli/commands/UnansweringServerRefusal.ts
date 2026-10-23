import { CommandRefusal }     from '../CommandRefusal.ts';
import { serverRecordPathOf } from '../ServerRecordFile.ts';
import type { ServerRecord }  from '../ServerRecordFile.ts';

/** For a record whose process lives but does not answer as the dashboard: it may be slow, or not the dashboard at all. */
export function unansweringServerRefusalFor(record: ServerRecord, homeDirectory: string): CommandRefusal {
  return new CommandRefusal(
    `The server record names pid ${record.pid} at ${record.url}, which runs but does not answer as the dashboard; `
    + `the record is left in place. Try again, or remove ${serverRecordPathOf(homeDirectory)} if pid ${record.pid} is not the dashboard.`,
  );
}
