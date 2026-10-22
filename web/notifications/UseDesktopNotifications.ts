import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import type { DashboardSnapshot }                           from '../../src/shared/DashboardContract.ts';
import { PreferenceStore }                                  from '../preferences/PreferenceStore.ts';
import { boardHashOf }                                      from '../shell/HashRoute.ts';
import type { DashboardStream }                             from '../shell/UseDashboardStream.ts';
import { type DueNotification, NotificationTransitionUtil } from './NotificationTransitionUtil.ts';

const OPT_IN_STORAGE_KEY = 'agent-dashboard:notifications';
const OPTED_IN_VALUE = 'opted-in';
const MUTE_STORAGE_KEY = 'agent-dashboard:notifications-muted';
const MUTED_VALUE = 'muted';
const UNMUTED_VALUE = 'unmuted';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export interface DesktopNotifications {
  permission: NotificationPermissionState;
  optedIn:    boolean;
  muted:      boolean;
  /** Asks the browser for permission; call it only from the user's click. */
  optIn:      () => void;
  toggleMute: () => void;
}

function currentPermission(): NotificationPermissionState {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

function raise(notification: DueNotification): void {
  const shown = new Notification(notification.project, { body: notification.text, tag: notification.tag });
  shown.addEventListener('click', () => {
    window.focus();
    window.location.hash = boardHashOf(notification.trackerId);
    shown.close();
  });
}

/**
 * Browser notifications for what changed between consecutive snapshots of one connection: the first snapshot of each
 * connection is the baseline, so a reconnect never replays what happened while it was down.
 */
export function useDesktopNotifications(stream: DashboardStream): DesktopNotifications {
  const [permission, setPermission] = useState<NotificationPermissionState>(currentPermission);
  const [optedIn, setOptedIn] = useState(() => PreferenceStore.readText(OPT_IN_STORAGE_KEY) === OPTED_IN_VALUE);
  const [muted, setMuted] = useState(() => PreferenceStore.readText(MUTE_STORAGE_KEY) === MUTED_VALUE);
  const preferenceReference = useRef({ optedIn, muted });
  preferenceReference.current = { optedIn, muted };
  const lastSeenReference = useRef<{ snapshot: DashboardSnapshot | null; connectionNumber: number }>({ snapshot: null, connectionNumber: -1 });

  const { snapshot, snapshotConnectionNumber } = stream;
  useEffect(() => {
    if (snapshot === null) return;
    const lastSeen = lastSeenReference.current;
    const previous = lastSeen.connectionNumber === snapshotConnectionNumber ? lastSeen.snapshot : null;
    lastSeenReference.current = { snapshot, connectionNumber: snapshotConnectionNumber };
    if (previous === snapshot) return;
    const notificationsDue = NotificationTransitionUtil.notificationsDueOf(previous, snapshot);
    const gate = { ...preferenceReference.current, permission: currentPermission(), tabFocused: document.hasFocus() };
    if (notificationsDue.length === 0 || !NotificationTransitionUtil.mayRaise(gate)) return;
    notificationsDue.forEach(raise);
  }, [snapshot, snapshotConnectionNumber]);

  const optIn = useCallback(() => {
    if (!('Notification' in window)) return;
    void Notification.requestPermission().then((granted) => {
      setPermission(granted);
      if (granted !== 'granted') return;
      setOptedIn(true);
      setMuted(false);
      PreferenceStore.writeText(OPT_IN_STORAGE_KEY, OPTED_IN_VALUE);
      PreferenceStore.writeText(MUTE_STORAGE_KEY, UNMUTED_VALUE);
    });
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!muted);
    PreferenceStore.writeText(MUTE_STORAGE_KEY, muted ? UNMUTED_VALUE : MUTED_VALUE);
  }, [muted]);

  return {
    permission, optedIn, muted, optIn, toggleMute
  };
}
