/** The registry lives at `<home>/.agent-progress-monitor/projects.json`, so its path names the serving machine's home. */
const REGISTRY_FOLDER_SEGMENT = '/.agent-progress-monitor/';
const HOME_SIGN = '~';

function homeDirectoryOf(registryPath: string): string | null {
  const folderIndex = registryPath.lastIndexOf(REGISTRY_FOLDER_SEGMENT);
  return folderIndex > 0 ? registryPath.slice(0, folderIndex) : null;
}

/** A root inside the home reads `~/…`; any other root, or an unknown home, is shown as given. */
function shortenedRootOf(root: string, homeDirectory: string | null): string {
  if (homeDirectory === null) return root;
  if (root === homeDirectory) return HOME_SIGN;
  return root.startsWith(`${homeDirectory}/`) ? `${HOME_SIGN}${root.slice(homeDirectory.length)}` : root;
}

export const RootPathUtil = Object.freeze({ homeDirectoryOf, shortenedRootOf });
