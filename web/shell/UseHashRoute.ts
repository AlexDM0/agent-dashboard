import { useEffect, useState }         from 'react';
import { type HashRoute, hashRouteOf } from './HashRoute.ts';

export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState(() => hashRouteOf(window.location.hash));
  useEffect(() => {
    const followHash = (): void => setRoute(hashRouteOf(window.location.hash));
    window.addEventListener('hashchange', followHash);
    return () => window.removeEventListener('hashchange', followHash);
  }, []);
  return route;
}
