/** Signal 0 checks existence without delivering anything; EPERM means the process exists under another user. */
export function processIsAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (problem) {
    return (problem as NodeJS.ErrnoException).code === 'EPERM';
  }
}
