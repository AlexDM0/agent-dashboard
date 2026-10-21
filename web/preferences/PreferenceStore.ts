/** The one reach into browser storage. Storage can be blocked (a private window, cleared site data), so every access is guarded. */

function readText(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeText(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A blocked store only loses the preference for the next visit.
  }
}

export const PreferenceStore = Object.freeze({ readText, writeText });
