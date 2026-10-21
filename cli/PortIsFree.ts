/** Whether nothing listens on the port on 127.0.0.1, asked by binding it for a moment. */
export function portIsFree(port: number): boolean {
  try {
    const listener = Bun.listen({ hostname: '127.0.0.1', port, socket: { data: () => {} } });
    listener.stop(true);
    return true;
  } catch {
    return false;
  }
}
