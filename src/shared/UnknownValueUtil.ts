/** Questions asked of a value whose type is not known: a parsed document's part, or whatever a `catch` caught. */

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The Node-style `code` (`ENOENT`, `EADDRINUSE`) a system error carries, or null for anything else. */
function errorCodeOf(error: unknown): string | null {
  return isJsonObject(error) && typeof error['code'] === 'string' ? error['code'] : null;
}

export const UnknownValueUtil = Object.freeze({ isJsonObject, errorMessageOf, errorCodeOf });
