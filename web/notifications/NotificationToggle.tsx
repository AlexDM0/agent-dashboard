import type { DesktopNotifications } from './UseDesktopNotifications.ts';

interface NotificationToggleProperties {
  notifications: DesktopNotifications;
}

/** Off until the user opts in on a click, which is the only place permission is asked; then a mute toggle. */
export function NotificationToggle({ notifications }: NotificationToggleProperties) {
  const { permission, optedIn, muted } = notifications;
  if (permission === 'unsupported') return null;
  if (permission === 'denied') {
    return (
      <button type="button" className="ap-control ap-notification-toggle" disabled title="Notifications are blocked in this browser's site settings">
        Notifications blocked
      </button>
    );
  }
  if (!optedIn || permission !== 'granted') {
    return (
      <button type="button" className="ap-control ap-notification-toggle" onClick={notifications.optIn}>
        Notify me
      </button>
    );
  }
  return (
    <button
      type="button"
      className="ap-control ap-notification-toggle"
      aria-label="Mute notifications"
      aria-pressed={muted}
      data-muted={muted}
      onClick={notifications.toggleMute}
    >
      {muted ? 'Muted' : 'Notifying'}
    </button>
  );
}
