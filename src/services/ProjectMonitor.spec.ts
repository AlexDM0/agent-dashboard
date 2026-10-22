/**
 * The monitor is held against a scratch home folder with a fake status reader and short intervals, so every case runs
 * on real watches but fast: the registry appearing, changing, turning unreadable and losing a project; a change a new
 * watch never reports, which the sweep after every new watch still finds; a project folder
 * changing (one debounced read per burst), and its metadata changing with no read; a read failing or throwing; missing
 * folders; the read cap; the sweep; and `stop` leaving no watch and no further read, not even one queued behind the cap.
 */
import {
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { type BoardSummaryVerdict } from '../adapters/BoardSummaryMapper.ts';
import { type DashboardSnapshot }   from '../shared/DashboardContract.ts';
import {
  createExampleProjectRoot,
  exampleBoardSummary,
  exampleRegistryEntry,
  writeExampleRegistry
} from '../testing/ExampleBoards.ts';
import { createScratchDirectory, removeScratchDirectory, requireScratchDirectory } from '../testing/ScratchDirectory.ts';
import { waitUntil }                                                               from '../testing/WaitUntil.ts';
import { type ProjectMonitor, type ProjectMonitorOptions, createProjectMonitor }   from './ProjectMonitor.ts';

const QUIET_MILLISECONDS = 30;
const LONG_SWEEP_MILLISECONDS = 60_000;
const SHORT_SWEEP_MILLISECONDS = 60;
const SETTLE_MILLISECONDS = 200;
const SLOW_READ_MILLISECONDS = 300;
const BURST_QUIET_MILLISECONDS = 120;
const EXAMPLE_INSTANT = new Date('2026-10-21T12:00:00.000Z');
const EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT = 12;

let scratchDirectory = '';
let homeDirectory = '';
let monitor: ProjectMonitor | null = null;
let statusReadRoots: string[] = [];

beforeEach(() => {
  scratchDirectory = createScratchDirectory('project-monitor');
  homeDirectory = join(scratchDirectory, 'home');
  mkdirSync(homeDirectory);
  statusReadRoots = [];
});

afterEach(async () => {
  await monitor?.stop();
  monitor = null;
  removeScratchDirectory(scratchDirectory);
});

function readyStatusReader(root: string): Promise<BoardSummaryVerdict> {
  statusReadRoots.push(root);
  return Promise.resolve({ kind: 'ready', board: exampleBoardSummary() });
}

function startedMonitor(overrides: Partial<ProjectMonitorOptions> = {}): Promise<ProjectMonitor> {
  requireScratchDirectory(overrides.homeDirectory ?? homeDirectory);
  const created = createProjectMonitor({
    homeDirectory,
    readBoardStatus:              readyStatusReader,
    clock:                        () => EXAMPLE_INSTANT,
    quietMilliseconds:            QUIET_MILLISECONDS,
    maximumWaitMilliseconds:      LONG_SWEEP_MILLISECONDS,
    sweepIntervalMilliseconds:    LONG_SWEEP_MILLISECONDS,
    maximumConcurrentStatusReads: 4,
    machineParallelAgentLimit:    EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
    ...overrides,
  });
  monitor = created;
  return created.start().then(() => created);
}

function readsOf(root: string): number {
  return statusReadRoots.filter((readRoot) => readRoot === root).length;
}

test('with no registry the snapshot is missing and empty, and a registry that appears later is picked up', async () => {
  const running = await startedMonitor();
  expect(running.snapshot()).toEqual({
    registry:                  { kind: 'missing' },
    registryPath:              join(homeDirectory, '.agent-progress-monitor', 'projects.json'),
    projects:                  [],
    generatedAt:               EXAMPLE_INSTANT.toISOString(),
    machineParallelAgentLimit: EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
  });

  const root = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(root, 'example-storefront') });
  await waitUntil(() => running.snapshot().projects.length === 1, 'the new registry is read');

  const [project] = running.snapshot().projects;
  expect(running.snapshot().registry).toEqual({ kind: 'ready' });
  expect(project).toEqual({
    trackerId:     'tracker-storefront',
    project:       'example-storefront',
    root,
    gitOrigin:     'git@example.invalid:example/example-storefront.git',
    registeredAt:  '2026-10-21T10:00:00+02:00',
    lastChangedAt: '2026-10-21T11:30:00+02:00',
    lastCommand:   'ticket finish',
    pageAvailable: true,
    pageUrl:       '/projects/tracker-storefront/page/progress.html',
    readAt:        EXAMPLE_INSTANT.toISOString(),
    health:        { kind: 'ready', board: exampleBoardSummary() },
  });
  expect(running.pageFolderOf('tracker-storefront')).toBe(join(root, '.agent-progress'));
});

// A change behind a symbolic link raises no event in the watched folder, so it stands in for one the new watch missed.
test('a registry folder that appears unreported by the home folder watch is still read after one quiet period', async () => {
  const elsewhereDirectory = join(scratchDirectory, 'elsewhere');
  mkdirSync(elsewhereDirectory);
  symlinkSync(join(elsewhereDirectory, '.agent-progress-monitor'), join(homeDirectory, '.agent-progress-monitor'));
  // macOS may still report the link made just before the watch began, which would hide the case; it is let go stale first.
  await Bun.sleep(SETTLE_MILLISECONDS);
  const running = await startedMonitor();
  expect(running.snapshot().registry).toEqual({ kind: 'missing' });

  const root = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(elsewhereDirectory, { 'tracker-storefront': exampleRegistryEntry(root, 'example-storefront') });
  await waitUntil(() => running.snapshot().projects.length === 1, 'the unreported registry is read');
});

test('a registry change unreported by the registry folder watch is still read after one quiet period', async () => {
  const elsewhereDirectory = join(scratchDirectory, 'elsewhere');
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  const agency = createExampleProjectRoot(scratchDirectory, 'example-agency');
  mkdirSync(elsewhereDirectory);
  writeExampleRegistry(elsewhereDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  mkdirSync(join(homeDirectory, '.agent-progress-monitor'));
  symlinkSync(join(elsewhereDirectory, '.agent-progress-monitor', 'projects.json'), join(homeDirectory, '.agent-progress-monitor', 'projects.json'));
  // macOS may still report the link made just before the watch began, which would hide the case; it is let go stale first.
  await Bun.sleep(SETTLE_MILLISECONDS);
  const running = await startedMonitor();
  expect(running.snapshot().projects).toHaveLength(1);

  writeExampleRegistry(elsewhereDirectory, {
    'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront'),
    'tracker-agency':     exampleRegistryEntry(agency, 'Example Agency'),
  });
  await waitUntil(() => running.snapshot().projects.length === 2, 'the unreported change is read');
});

test('start resolves with every registered project read once, in registry order', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  const agency = createExampleProjectRoot(scratchDirectory, 'example-agency', false);
  writeExampleRegistry(homeDirectory, {
    'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront'),
    'tracker-agency':     exampleRegistryEntry(agency, 'Example Agency'),
  });
  const running = await startedMonitor();
  expect(running.snapshot().projects.map((project) => [project.trackerId, project.pageAvailable])).toEqual([
    ['tracker-storefront', true],
    ['tracker-agency', false],
  ]);
  expect(statusReadRoots.toSorted()).toEqual([agency, storefront].toSorted());
});

test('a registry change adds a project, drops a removed one with its watch, and updates changed metadata', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  const agency = createExampleProjectRoot(scratchDirectory, 'example-agency');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  const running = await startedMonitor();
  const watchesWithOneProject = running.openWatchCount();

  writeExampleRegistry(homeDirectory, {
    'tracker-storefront': { ...exampleRegistryEntry(storefront, 'example-storefront'), lastCommand: 'ticket deliver' },
    'tracker-agency':     exampleRegistryEntry(agency, 'Example Agency'),
  });
  await waitUntil(() => running.snapshot().projects.length === 2, 'the added project is read');
  expect(running.snapshot().projects.find((project) => project.trackerId === 'tracker-storefront')?.lastCommand).toBe('ticket deliver');
  expect(running.openWatchCount()).toBe(watchesWithOneProject + 1);

  writeExampleRegistry(homeDirectory, { 'tracker-agency': exampleRegistryEntry(agency, 'Example Agency') });
  await waitUntil(() => running.snapshot().projects.length === 1, 'the removed project is dropped');
  expect(running.snapshot().projects[0]?.trackerId).toBe('tracker-agency');
  expect(running.openWatchCount()).toBe(watchesWithOneProject);
  expect(running.pageFolderOf('tracker-storefront')).toBeNull();
});

test('a registry change to metadata alone updates the snapshot without another status read', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  const running = await startedMonitor();
  // macOS may still report the page written just before the watch began; that read is let pass first.
  await Bun.sleep(SETTLE_MILLISECONDS);
  const readsBeforeTheChange = readsOf(storefront);

  const changedEntry = { ...exampleRegistryEntry(storefront, 'example-storefront'), lastChangedAt: '2026-10-21T12:45:00+02:00', lastCommand: 'ticket claim' };
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': changedEntry });
  await waitUntil(() => running.snapshot().projects[0]?.lastCommand === 'ticket claim', 'the new metadata is shown');
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(readsOf(storefront)).toBe(readsBeforeTheChange);
});

// A removed folder is not always reported by the watch on macOS, so the sweep, shortened here, is what finds it.
test('a registry that turns newer is unreadable and shows no projects; one that disappears is missing', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  const running = await startedMonitor({ sweepIntervalMilliseconds: SHORT_SWEEP_MILLISECONDS });

  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') }, 2);
  await waitUntil(() => running.snapshot().registry.kind === 'unreadable', 'the newer registry is reported');
  expect(running.snapshot().projects).toEqual([]);

  rmSync(join(homeDirectory, '.agent-progress-monitor'), { recursive: true });
  await waitUntil(() => running.snapshot().registry.kind === 'missing', 'the removed registry is missing');
});

test('a burst of changes in a project folder is one more read after the quiet period', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  // A quiet period long enough that a loaded machine delivering the three events apart still sees one burst.
  await startedMonitor({ quietMilliseconds: BURST_QUIET_MILLISECONDS });
  expect(readsOf(storefront)).toBe(1);
  // macOS may still report the page written just before the watch began; that read is let pass first.
  await Bun.sleep(SETTLE_MILLISECONDS + BURST_QUIET_MILLISECONDS);
  const readsBeforeTheBurst = readsOf(storefront);

  for (const fileName of ['progress.json', 'progress.html', 'progress.stamp.js']) {
    writeFileSync(join(storefront, '.agent-progress', fileName), 'Example Agency');
  }
  await waitUntil(() => readsOf(storefront) === readsBeforeTheBurst + 1, 'the change is read');
  await Bun.sleep(SETTLE_MILLISECONDS + BURST_QUIET_MILLISECONDS);
  expect(readsOf(storefront)).toBe(readsBeforeTheBurst + 1);
});

test('a failing read is the project\'s unreadable verdict, and a throwing reader is one too', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  const agency = createExampleProjectRoot(scratchDirectory, 'example-agency');
  writeExampleRegistry(homeDirectory, {
    'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront'),
    'tracker-agency':     exampleRegistryEntry(agency, 'Example Agency'),
  });
  const running = await startedMonitor({
    readBoardStatus: (root) => {
      if (root === storefront) return Promise.resolve({ kind: 'unreadable', reason: 'agent-progress status exited with code 2: Example' });
      return Promise.reject(new Error('Example spawn failure'));
    },
  });
  expect(running.snapshot().projects.map((project) => project.health)).toEqual([
    { kind: 'unreadable', reason: 'agent-progress status exited with code 2: Example' },
    { kind: 'unreadable', reason: 'the board could not be read: Example spawn failure' },
  ]);
});

test('a missing root or tracker folder is missing without a status read, and recovers once it is back', async () => {
  const absentRoot = join(scratchDirectory, 'absent-project');
  const rootWithoutTracker = join(scratchDirectory, 'example-agency');
  mkdirSync(rootWithoutTracker);
  writeExampleRegistry(homeDirectory, {
    'tracker-absent': exampleRegistryEntry(absentRoot, 'example-storefront'),
    'tracker-agency': exampleRegistryEntry(rootWithoutTracker, 'Example Agency'),
  });
  const running = await startedMonitor({ sweepIntervalMilliseconds: SHORT_SWEEP_MILLISECONDS });
  expect(running.snapshot().projects.map((project) => project.health.kind)).toEqual(['missing', 'missing']);
  expect(statusReadRoots).toEqual([]);

  createExampleProjectRoot(scratchDirectory, 'example-agency');
  await waitUntil(() => running.snapshot().projects[1]?.health.kind === 'ready', 'the sweep reads the recreated tracker');
});

test('the safety sweep reads every project again with no file-system event', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  await startedMonitor({ sweepIntervalMilliseconds: SHORT_SWEEP_MILLISECONDS });
  await waitUntil(() => readsOf(storefront) >= 3, 'the sweep reads again');
});

test('no more status reads run at once than the cap', async () => {
  const entries: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < 6; i++) {
    entries[`tracker-${i}`] = exampleRegistryEntry(createExampleProjectRoot(scratchDirectory, `example-project-${i}`), `example-project-${i}`);
  }
  writeExampleRegistry(homeDirectory, entries);
  let readsInFlight = 0;
  let mostReadsInFlight = 0;
  const running = await startedMonitor({
    maximumConcurrentStatusReads: 2,
    readBoardStatus:              async () => {
      readsInFlight++;
      mostReadsInFlight = Math.max(mostReadsInFlight, readsInFlight);
      await Bun.sleep(QUIET_MILLISECONDS);
      readsInFlight--;
      return { kind: 'ready', board: exampleBoardSummary() };
    },
  });
  expect(running.snapshot().projects).toHaveLength(6);
  expect(mostReadsInFlight).toBe(2);
});

test('a subscriber gets the whole snapshot after a change, and no more once unsubscribed', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  const running = await startedMonitor();
  const received: DashboardSnapshot[] = [];
  const unsubscribe = running.subscribe((snapshot) => received.push(snapshot));

  writeFileSync(join(storefront, '.agent-progress', 'progress.json'), '{}');
  await waitUntil(() => received.length > 0, 'the subscriber hears the change');
  expect(received.at(-1)?.projects.map((project) => project.trackerId)).toEqual(['tracker-storefront']);

  unsubscribe();
  const heardBefore = received.length;
  writeFileSync(join(storefront, '.agent-progress', 'progress.json'), '{"example":1}');
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(received).toHaveLength(heardBefore);
});

test('stop leaves no watch open and no read after it', async () => {
  const storefront = createExampleProjectRoot(scratchDirectory, 'example-storefront');
  writeExampleRegistry(homeDirectory, { 'tracker-storefront': exampleRegistryEntry(storefront, 'example-storefront') });
  const running = await startedMonitor({ sweepIntervalMilliseconds: SHORT_SWEEP_MILLISECONDS });
  expect(running.openWatchCount()).toBe(2);

  await running.stop();
  expect(running.openWatchCount()).toBe(0);
  const readsAtStop = statusReadRoots.length;
  writeFileSync(join(storefront, '.agent-progress', 'progress.json'), '{}');
  writeExampleRegistry(homeDirectory, {});
  await Bun.sleep(SETTLE_MILLISECONDS);
  expect(statusReadRoots).toHaveLength(readsAtStop);
});

test('stop leaves the reads still queued behind the cap unstarted', async () => {
  const entries: Record<string, Record<string, unknown>> = {};
  for (let i = 0; i < 5; i++) {
    entries[`tracker-${i}`] = exampleRegistryEntry(createExampleProjectRoot(scratchDirectory, `example-project-${i}`), `example-project-${i}`);
  }
  writeExampleRegistry(homeDirectory, entries);
  let stoppedAt: number | null = null;
  let readsStartedAfterStop = 0;
  const created = createProjectMonitor({
    homeDirectory,
    readBoardStatus: async () => {
      if (stoppedAt !== null) readsStartedAfterStop++;
      await Bun.sleep(SLOW_READ_MILLISECONDS);
      return { kind: 'ready', board: exampleBoardSummary() };
    },
    clock:                        () => EXAMPLE_INSTANT,
    quietMilliseconds:            QUIET_MILLISECONDS,
    maximumWaitMilliseconds:      LONG_SWEEP_MILLISECONDS,
    sweepIntervalMilliseconds:    LONG_SWEEP_MILLISECONDS,
    maximumConcurrentStatusReads: 1,
    machineParallelAgentLimit:    EXAMPLE_MACHINE_PARALLEL_AGENT_LIMIT,
  });
  monitor = created;
  const starting = created.start();
  await Bun.sleep(SLOW_READ_MILLISECONDS / 3);
  await created.stop();
  stoppedAt = performance.now();
  await starting;
  await Bun.sleep(SLOW_READ_MILLISECONDS * 5);
  expect(readsStartedAfterStop).toBe(0);
});
