/**
 * A Claude Code session's cross-session inbox: one NDJSON user message written to its messaging Unix socket opens a
 * turn in that session. The socket answers nothing, so a line written without error is all that delivery can mean.
 */
import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';

export type SessionSocketVerdict = { kind: 'delivered' } | { kind: 'failed'; reason: string };

/** The one line the receiving session reads as a user message from a peer. */
export function sessionMessageLineOf(text: string): string {
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;
}

/** Connects, writes `payload` (nothing for a probe), and closes; delivered once the connection closes after opening. */
function sendOnce(socketPath: string, payload: string, timeoutMilliseconds: number): Promise<SessionSocketVerdict> {
  return new Promise((resolve) => {
    let settled = false;
    let opened = false;
    let closeConnection = (): void => {};
    const timer = setTimeout(() => {
      closeConnection();
      settle({ kind: 'failed', reason: `The session socket ${socketPath} took longer than ${timeoutMilliseconds} ms` });
    }, timeoutMilliseconds);

    function settle(verdict: SessionSocketVerdict): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(verdict);
    }

    function failed(error: unknown): void {
      settle({ kind: 'failed', reason: `The session socket ${socketPath} failed: ${UnknownValueUtil.errorMessageOf(error)}` });
    }

    let unwrittenBytes = new TextEncoder().encode(payload);

    /** A socket write may take only part of the bytes; the rest waits for `drain`, and only an empty remainder ends it. */
    function writeRemainder(socket: { write: (bytes: Uint8Array) => number; end: () => void }): void {
      while (unwrittenBytes.length > 0) {
        const writtenByteCount = socket.write(unwrittenBytes);
        if (writtenByteCount <= 0) return;
        unwrittenBytes = unwrittenBytes.subarray(writtenByteCount);
      }
      socket.end();
    }

    Bun.connect({
      unix:   socketPath,
      socket: {
        open(socket) {
          opened = true;
          closeConnection = () => socket.end();
          writeRemainder(socket);
        },
        drain(socket) {
          writeRemainder(socket);
        },
        data() {
          // The session sends nothing back; anything it does send is not read.
        },
        close() {
          if (!opened) settle({ kind: 'failed', reason: `The session socket ${socketPath} closed before it opened` });
          else if (unwrittenBytes.length > 0) settle({ kind: 'failed', reason: `The session socket ${socketPath} closed before the whole line was written` });
          else settle({ kind: 'delivered' });
        },
        error(_socket, error) {
          failed(error);
        },
        connectError(_socket, error) {
          failed(error);
        },
      },
    }).catch(failed);
  });
}

export function writeSessionMessage(socketPath: string, text: string, timeoutMilliseconds: number): Promise<SessionSocketVerdict> {
  return sendOnce(socketPath, sessionMessageLineOf(text), timeoutMilliseconds);
}

/** Whether something listens on the socket, asked by opening a connection and closing it with nothing written. */
export async function sessionSocketAccepts(socketPath: string, timeoutMilliseconds: number): Promise<boolean> {
  return (await sendOnce(socketPath, '', timeoutMilliseconds)).kind === 'delivered';
}
