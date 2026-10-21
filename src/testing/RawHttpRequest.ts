/**
 * Sends one HTTP/1.1 request over a plain socket, the request target and headers exactly as written: `fetch` would
 * normalise a `..` away and set its own Host, which are the very things a server spec must plant. Test-only.
 */
export interface RawHttpAnswer {
  status:  number;
  headers: Map<string, string>;
  body:    string;
}

export interface RawHttpRequest {
  port:     number;
  method?:  string;
  target:   string;
  headers?: Record<string, string>;
}

const STATUS_LINE_PATTERN = /^HTTP\/1\.[01] (\d{3})/;

export function sendRawHttpRequest(request: RawHttpRequest): Promise<RawHttpAnswer> {
  const headers = { 'Host': `127.0.0.1:${request.port}`, 'Connection': 'close', ...request.headers };
  const requestText = [
    `${request.method ?? 'GET'} ${request.target} HTTP/1.1`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    '',
    '',
  ].join('\r\n');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    void Bun.connect({
      hostname: '127.0.0.1',
      port:     request.port,
      socket:   {
        open(socket) {
          socket.write(requestText);
        },
        data(_socket, chunk) {
          chunks.push(chunk);
        },
        close() {
          const text = Buffer.concat(chunks).toString('utf8');
          const [head = '', ...bodyParts] = text.split('\r\n\r\n');
          const [statusLine = '', ...headerLines] = head.split('\r\n');
          const status = Number(STATUS_LINE_PATTERN.exec(statusLine)?.[1] ?? Number.NaN);
          const answerHeaders = new Map(headerLines.map((line) => {
            const separator = line.indexOf(':');
            return [line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim()] as const;
          }));
          resolve({ status, headers: answerHeaders, body: bodyParts.join('\r\n\r\n') });
        },
        error(_socket, error) {
          reject(error);
        },
      },
    }).catch(reject);
  });
}
