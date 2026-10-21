/** Reads agent-progress's machine-wide registry, `~/.agent-progress-monitor/projects.json`, into a verdict; never throws. */
import { readFile } from 'node:fs/promises';

import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }  from '../shared/constants/DashboardFiles.ts';

export interface RegistryEntry {
  trackerId:     string;
  project:       string;
  root:          string;
  progressHtml:  string;
  progressJson:  string;
  gitOrigin:     string | null;
  registeredAt:  string;
  lastChangedAt: string;
  lastCommand:   string;
}

export type RegistryVerdict =
  | { kind: 'ready'; entries: RegistryEntry[] }
  | { kind: 'missing' }
  | { kind: 'unreadable'; reason: string };

function stringFieldOf(record: Record<string, unknown>, field: string): string | null {
  const value = Object.hasOwn(record, field) ? record[field] : undefined;
  return typeof value === 'string' ? value : null;
}

/** An entry missing a required string is skipped, so one damaged entry does not hide the others. */
function entryOf(trackerId: string, value: unknown): RegistryEntry | null {
  if (!UnknownValueUtil.isJsonObject(value)) return null;
  const project = stringFieldOf(value, 'project');
  const root = stringFieldOf(value, 'root');
  const progressHtml = stringFieldOf(value, 'progressHtml');
  const progressJson = stringFieldOf(value, 'progressJson');
  const registeredAt = stringFieldOf(value, 'registeredAt');
  const lastChangedAt = stringFieldOf(value, 'lastChangedAt');
  const lastCommand = stringFieldOf(value, 'lastCommand');
  if (project === null || root === null || progressHtml === null || progressJson === null) return null;
  if (registeredAt === null || lastChangedAt === null || lastCommand === null) return null;
  const gitOrigin = stringFieldOf(value, 'gitOrigin');
  return {
    trackerId, project, root, progressHtml, progressJson, gitOrigin, registeredAt, lastChangedAt, lastCommand
  };
}

/** Parses the registry's text; a version other than the supported one is unreadable, never guessed at. */
export function registryVerdictOf(text: string): RegistryVerdict {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    return { kind: 'unreadable', reason: `projects.json is not valid JSON: ${UnknownValueUtil.errorMessageOf(error)}` };
  }
  if (!UnknownValueUtil.isJsonObject(document)) return { kind: 'unreadable', reason: 'projects.json does not hold a JSON object' };

  const { version } = document;
  if (typeof version === 'number' && version > DASHBOARD_FILES.SUPPORTED_REGISTRY_VERSION) {
    return {
      kind:   'unreadable',
      reason: `projects.json is version ${version}, newer than version ${DASHBOARD_FILES.SUPPORTED_REGISTRY_VERSION} this dashboard reads; update agent-dashboard`,
    };
  }
  if (version !== DASHBOARD_FILES.SUPPORTED_REGISTRY_VERSION) {
    return { kind: 'unreadable', reason: `projects.json has no supported version (found ${JSON.stringify(version) ?? 'none'})` };
  }

  const { projects } = document;
  if (!UnknownValueUtil.isJsonObject(projects)) return { kind: 'unreadable', reason: 'projects.json has no projects object' };
  const entries = Object.entries(projects)
    .map(([trackerId, value]) => entryOf(trackerId, value))
    .filter((entry): entry is RegistryEntry => entry !== null);
  return { kind: 'ready', entries };
}

export async function readRegistry(registryPath: string): Promise<RegistryVerdict> {
  let text: string;
  try {
    text = await readFile(registryPath, 'utf8');
  } catch (error) {
    const code = UnknownValueUtil.errorCodeOf(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'missing' };
    return { kind: 'unreadable', reason: `projects.json cannot be read: ${UnknownValueUtil.errorMessageOf(error)}` };
  }
  return registryVerdictOf(text);
}
