/**
 * The registry is written by another tool and may be absent, damaged or newer than this dashboard: each is a verdict,
 * never a throw. A good entry survives a damaged sibling, unknown keys are ignored, and the registry's own order is kept.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { createScratchDirectory, removeScratchDirectory } from '../testing/ScratchDirectory.ts';
import { readRegistry, registryVerdictOf }                from './RegistryReader.ts';

const EXAMPLE_ENTRY = {
  project:       'Example Agency',
  root:          '/Users/alex.example/development/example-agency',
  progressHtml:  '/Users/alex.example/development/example-agency/.agent-progress/progress.html',
  progressJson:  '/Users/alex.example/development/example-agency/.agent-progress/progress.json',
  gitOrigin:     'git@example.invalid:example/example-agency.git',
  registeredAt:  '2026-10-21T10:00:00+02:00',
  lastChangedAt: '2026-10-21T11:30:00+02:00',
  lastCommand:   'ticket finish',
};

let scratchDirectory = '';

beforeEach(() => {
  scratchDirectory = createScratchDirectory('registry-reader');
});

afterEach(() => removeScratchDirectory(scratchDirectory));

test('a version 1 registry is ready, its entries keyed by tracker id in the file order', () => {
  const verdict = registryVerdictOf(JSON.stringify({
    version:  1,
    projects: {
      'tracker-b': { ...EXAMPLE_ENTRY, project: 'example-storefront' },
      'tracker-a': EXAMPLE_ENTRY,
    },
  }));
  expect(verdict).toEqual({
    kind:    'ready',
    entries: [
      { trackerId: 'tracker-b', ...EXAMPLE_ENTRY, project: 'example-storefront' },
      { trackerId: 'tracker-a', ...EXAMPLE_ENTRY },
    ],
  });
});

test('unknown keys at the top level and on an entry are ignored, and a null origin stays null', () => {
  const verdict = registryVerdictOf(JSON.stringify({
    version:  1,
    monitor:  { example: true },
    projects: { 'tracker-a': { ...EXAMPLE_ENTRY, gitOrigin: null, futureKey: 'Example' } },
  }));
  expect(verdict).toEqual({ kind: 'ready', entries: [{ trackerId: 'tracker-a', ...EXAMPLE_ENTRY, gitOrigin: null }] });
});

test('an entry that is no object or misses a required string is skipped, and the good ones stay', () => {
  const { lastCommand: _omitted, ...entryWithoutCommand } = EXAMPLE_ENTRY;
  const verdict = registryVerdictOf(JSON.stringify({
    version:  1,
    projects: {
      'tracker-array':      [],
      'tracker-text':       'Example Agency',
      'tracker-no-root':    { ...EXAMPLE_ENTRY, root: 42 },
      'tracker-no-command': entryWithoutCommand,
      'tracker-good':       EXAMPLE_ENTRY,
    },
  }));
  expect(verdict).toEqual({ kind: 'ready', entries: [{ trackerId: 'tracker-good', ...EXAMPLE_ENTRY }] });
});

test('a newer version is unreadable with a reason naming it', () => {
  const verdict = registryVerdictOf(JSON.stringify({ version: 2, projects: { 'tracker-a': EXAMPLE_ENTRY } }));
  expect(verdict.kind).toBe('unreadable');
  expect(verdict.kind === 'unreadable' ? verdict.reason : '').toContain('version 2');
});

test('invalid JSON, a non-object document, a missing version and a missing projects object are unreadable', () => {
  for (const text of ['{"version":1,', '[]', '{"projects":{}}', '{"version":1}', '{"version":1,"projects":[]}']) {
    expect(registryVerdictOf(text).kind, text).toBe('unreadable');
  }
});

test('a registry file that does not exist, or whose folder does not, is missing', async () => {
  expect(await readRegistry(join(scratchDirectory, '.agent-progress-monitor', 'projects.json'))).toEqual({ kind: 'missing' });
});

test('a registry read from disk is parsed, and a folder in its place is unreadable', async () => {
  const registryPath = join(scratchDirectory, 'projects.json');
  writeFileSync(registryPath, JSON.stringify({ version: 1, projects: { 'tracker-a': EXAMPLE_ENTRY } }));
  expect(await readRegistry(registryPath)).toEqual({ kind: 'ready', entries: [{ trackerId: 'tracker-a', ...EXAMPLE_ENTRY }] });

  const folderInPlace = join(scratchDirectory, 'folder', 'projects.json');
  mkdirSync(folderInPlace, { recursive: true });
  expect((await readRegistry(folderInPlace)).kind).toBe('unreadable');
});
