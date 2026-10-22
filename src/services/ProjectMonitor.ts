/**
 * Watches the registry and every registered project's `.agent-progress/` folder, refreshes a project's board through a
 * debounced runner when its folder changes, sweeps everything on an interval in case a watch missed an event, and hands
 * subscribers the whole `DashboardSnapshot` after every change. Every failure is a verdict; nothing throws out of it.
 */
import { type FSWatcher, statSync, watch } from 'node:fs';
import { dirname, join }                   from 'node:path';

import { type BoardSummaryVerdict }                      from '../adapters/BoardSummaryMapper.ts';
import { type RegistryEntry, readRegistry }              from '../adapters/RegistryReader.ts';
import { type CoalescingRunner, createCoalescingRunner } from '../lib/coalescing-runner/CoalescingRunner.ts';
import { createConcurrencyLimit }                        from '../lib/concurrency-limit/ConcurrencyLimit.ts';
import {
  type DashboardSnapshot,
  type ProjectHealth,
  type ProjectSnapshot,
  type RegistryHealth
} from '../shared/DashboardContract.ts';
import { UnknownValueUtil } from '../shared/UnknownValueUtil.ts';
import { DASHBOARD_FILES }  from '../shared/constants/DashboardFiles.ts';

export interface ProjectMonitorOptions {
  homeDirectory:                string;
  readBoardStatus:              (root: string) => Promise<BoardSummaryVerdict>;
  clock:                        () => Date;
  quietMilliseconds:            number;
  /** How long changes that keep arriving may put a project's refresh off. */
  maximumWaitMilliseconds:      number;
  sweepIntervalMilliseconds:    number;
  maximumConcurrentStatusReads: number;
  machineParallelAgentLimit:    number;
}

/** The snapshot before the server names the board origin it serves the pages from; each `pageUrl` is a path on it. */
export type MonitoredSnapshot = Omit<DashboardSnapshot, 'boardOrigin' | 'boardBridgeUrl'>;

export type SnapshotListener = (snapshot: MonitoredSnapshot) => void;

export interface ProjectMonitor {
  /** Reads the registry and every project once, then watches; resolves once that first read is complete. */
  start(): Promise<void>;
  snapshot(): MonitoredSnapshot;
  /** The folder a project's page is served from, or null for a tracker the registry does not hold. */
  pageFolderOf(trackerId: string): string | null;
  /** The project's root, or null for a tracker the registry does not hold. */
  rootOf(trackerId: string): string | null;
  /** Reads the project's board at once instead of waiting for its folder watch, and notifies subscribers. */
  refreshProjectNow(trackerId: string): Promise<void>;
  /** Returns the unsubscribe. */
  subscribe(listener: SnapshotListener): () => void;
  /** Open file-system watches, so a spec can prove `stop` leaves none. */
  openWatchCount(): number;
  stop(): Promise<void>;
}

interface FolderWatch {
  watcher:        FSWatcher;
  folderIdentity: string;
  failed:         boolean;
}

interface ProjectReading {
  health:        ProjectHealth;
  pageAvailable: boolean;
  readAt:        string;
}

interface MonitoredProject {
  entry:       RegistryEntry;
  runner:      CoalescingRunner;
  folderWatch: FolderWatch | null;
  reading:     ProjectReading | null;
}

/** A folder's device and inode, so a folder deleted and recreated between sweeps is watched afresh. */
function folderIdentityOf(folder: string): string | null {
  try {
    const status = statSync(folder);
    return status.isDirectory() ? `${status.dev}:${status.ino}` : null;
  } catch {
    return null;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function pageFolderOfEntry(entry: RegistryEntry): string {
  return dirname(entry.progressHtml);
}

function pageUrlOf(trackerId: string): string {
  return `/projects/${encodeURIComponent(trackerId)}/page/${DASHBOARD_FILES.PAGE_FILE_NAME}`;
}

function closeFolderWatch(folderWatch: FolderWatch | null): void {
  try {
    folderWatch?.watcher.close();
  } catch {
    // A watcher whose folder vanished may refuse to close; it is dropped either way.
  }
}

export function createProjectMonitor(options: ProjectMonitorOptions): ProjectMonitor {
  const registryFolder = join(options.homeDirectory, DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME);
  const registryPath = join(registryFolder, DASHBOARD_FILES.REGISTRY_FILE_NAME);
  const statusReadLimit = createConcurrencyLimit(options.maximumConcurrentStatusReads);
  const projects = new Map<string, MonitoredProject>();
  const listeners = new Set<SnapshotListener>();
  let projectOrder: string[] = [];
  let registryHealth: RegistryHealth = { kind: 'missing' };
  let registryWatch: FolderWatch | null = null;
  let homeWatch: FolderWatch | null = null;
  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const registryRunner = debouncedRunnerOf(refreshRegistry);

  function debouncedRunnerOf(run: () => Promise<void>): CoalescingRunner {
    return createCoalescingRunner({ run, quietMilliseconds: options.quietMilliseconds, maximumWaitMilliseconds: options.maximumWaitMilliseconds });
  }

  function snapshot(): MonitoredSnapshot {
    const projectSnapshots: ProjectSnapshot[] = [];
    for (const trackerId of projectOrder) {
      const project = projects.get(trackerId);
      if (project === undefined || project.reading === null) continue;
      const { entry } = project;
      const { reading } = project;
      projectSnapshots.push({
        trackerId,
        project:       entry.project,
        root:          entry.root,
        gitOrigin:     entry.gitOrigin,
        registeredAt:  entry.registeredAt,
        lastChangedAt: entry.lastChangedAt,
        lastCommand:   entry.lastCommand,
        pageAvailable: reading.pageAvailable,
        pageUrl:       pageUrlOf(trackerId),
        readAt:        reading.readAt,
        health:        reading.health,
      });
    }
    return {
      registry:                  registryHealth,
      registryPath,
      projects:                  projectSnapshots,
      generatedAt:               options.clock().toISOString(),
      machineParallelAgentLimit: options.machineParallelAgentLimit,
    };
  }

  function notify(): void {
    if (stopped || listeners.size === 0) return;
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current);
      } catch {
        // One failing subscriber must not starve the others.
      }
    }
  }

  /**
   * Watches the folder unless it is already watched as the same folder; a watch that cannot be set up leaves the sweep.
   * On macOS a new watch is not live at once, and setting it up briefly blinds every watch already open, so each new
   * watch sweeps: every folder is read once more a quiet period later, catching a change no watch reported.
   */
  function folderWatchFor(folder: string, existing: FolderWatch | null, runner: CoalescingRunner, reportsChange: (fileName: string | null) => boolean): FolderWatch | null {
    const folderIdentity = folderIdentityOf(folder);
    if (existing !== null && !existing.failed && existing.folderIdentity === folderIdentity) return existing;
    closeFolderWatch(existing);
    if (folderIdentity === null) return null;
    try {
      const watcher = watch(folder, (_eventType, fileName) => {
        if (reportsChange(fileName)) runner.trigger();
      });
      const folderWatch: FolderWatch = { watcher, folderIdentity, failed: false };
      watcher.on('error', () => {
        folderWatch.failed = true;
        closeFolderWatch(folderWatch);
      });
      sweep();
      return folderWatch;
    } catch {
      return null;
    }
  }

  function syncRegistryWatches(): void {
    if (stopped) return;
    registryWatch = folderWatchFor(registryFolder, registryWatch, registryRunner, (fileName) => fileName === null || fileName === DASHBOARD_FILES.REGISTRY_FILE_NAME);
    if (registryWatch !== null) {
      closeFolderWatch(homeWatch);
      homeWatch = null;
      return;
    }
    // Until the registry folder exists, its creation is watched for in the home folder.
    homeWatch = folderWatchFor(options.homeDirectory, homeWatch, registryRunner, (fileName) => fileName === null || fileName === DASHBOARD_FILES.REGISTRY_DIRECTORY_NAME);
  }

  function syncProjectWatch(project: MonitoredProject): void {
    if (stopped) return;
    project.folderWatch = folderWatchFor(pageFolderOfEntry(project.entry), project.folderWatch, project.runner, () => true);
  }

  function isStillMonitored(project: MonitoredProject): boolean {
    return !stopped && projects.get(project.entry.trackerId) === project;
  }

  /** Null once the project is no longer monitored: a read queued behind the cap is then never started. */
  async function healthOf(project: MonitoredProject): Promise<ProjectHealth | null> {
    const { entry } = project;
    if (folderIdentityOf(entry.root) === null) return { kind: 'missing', reason: `the project folder ${entry.root} is missing` };
    const pageFolder = pageFolderOfEntry(entry);
    if (folderIdentityOf(pageFolder) === null) return { kind: 'missing', reason: `the tracker folder ${pageFolder} is missing` };
    try {
      return await statusReadLimit.run(() => (isStillMonitored(project) ? options.readBoardStatus(entry.root) : Promise.resolve(null)));
    } catch (error) {
      return { kind: 'unreadable', reason: `the board could not be read: ${UnknownValueUtil.errorMessageOf(error)}` };
    }
  }

  async function refreshProject(trackerId: string): Promise<void> {
    const project = projects.get(trackerId);
    if (project === undefined || stopped) return;
    const health = await healthOf(project);
    if (health === null || !isStillMonitored(project)) return;
    project.reading = { health, pageAvailable: isFile(project.entry.progressHtml), readAt: options.clock().toISOString() };
    syncProjectWatch(project);
    notify();
  }

  function addProject(entry: RegistryEntry): MonitoredProject {
    const project: MonitoredProject = {
      entry,
      runner:      debouncedRunnerOf(() => refreshProject(entry.trackerId)),
      folderWatch: null,
      reading:     null,
    };
    projects.set(entry.trackerId, project);
    syncProjectWatch(project);
    return project;
  }

  /** A status read in flight is not waited for: its result is dropped, and the read ends at its own timeout. */
  function removeProject(trackerId: string): void {
    const project = projects.get(trackerId);
    if (project === undefined) return;
    projects.delete(trackerId);
    closeFolderWatch(project.folderWatch);
    project.folderWatch = null;
    void project.runner.stop();
  }

  async function refreshRegistry(): Promise<void> {
    if (stopped) return;
    const verdict = await readRegistry(registryPath);
    if (stopped) return;
    registryHealth = verdict.kind === 'unreadable' ? { kind: 'unreadable', reason: verdict.reason } : { kind: verdict.kind };
    syncRegistryWatches();

    const entries = verdict.kind === 'ready' ? verdict.entries : [];
    const registeredIds = new Set(entries.map((entry) => entry.trackerId));
    for (const trackerId of [...projects.keys()]) {
      if (!registeredIds.has(trackerId)) removeProject(trackerId);
    }
    const addedProjects: MonitoredProject[] = [];
    for (const entry of entries) {
      const project = projects.get(entry.trackerId);
      if (project === undefined) {
        addedProjects.push(addProject(entry));
      } else {
        // `lastChangedAt` and `lastCommand` change with every command, whose own folder write already schedules a read.
        const readingChanged = project.entry.root !== entry.root || project.entry.progressHtml !== entry.progressHtml;
        project.entry = entry;
        if (readingChanged) {
          syncProjectWatch(project);
          project.runner.trigger();
        }
      }
    }
    projectOrder = entries.map((entry) => entry.trackerId);
    notify();
    await Promise.all(addedProjects.map((project) => project.runner.runNow()));
  }

  function sweep(): void {
    registryRunner.trigger();
    for (const project of projects.values()) project.runner.trigger();
  }

  return {
    async start() {
      await registryRunner.runNow();
      if (!stopped && sweepTimer === null) sweepTimer = setInterval(sweep, options.sweepIntervalMilliseconds);
    },

    snapshot,

    pageFolderOf(trackerId) {
      const project = projects.get(trackerId);
      return project === undefined ? null : pageFolderOfEntry(project.entry);
    },

    rootOf(trackerId) {
      return projects.get(trackerId)?.entry.root ?? null;
    },

    async refreshProjectNow(trackerId) {
      await projects.get(trackerId)?.runner.runNow();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    openWatchCount() {
      const projectWatches = [...projects.values()].filter((project) => project.folderWatch !== null).length;
      return projectWatches + (registryWatch === null ? 0 : 1) + (homeWatch === null ? 0 : 1);
    },

    stop() {
      stopped = true;
      if (sweepTimer !== null) clearInterval(sweepTimer);
      sweepTimer = null;
      closeFolderWatch(registryWatch);
      closeFolderWatch(homeWatch);
      registryWatch = null;
      homeWatch = null;
      listeners.clear();
      for (const trackerId of [...projects.keys()]) removeProject(trackerId);
      void registryRunner.stop();
      return Promise.resolve();
    },
  };
}
