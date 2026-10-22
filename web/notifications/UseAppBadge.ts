import { useEffect } from 'react';

/** The installed app's icon carries the count, cleared at zero; a browser without the Badging API is left alone. */
export function useAppBadge(count: number): void {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    const badgeUpdate = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    badgeUpdate.catch(() => undefined);
  }, [count]);
}
