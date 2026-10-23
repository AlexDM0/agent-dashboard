import { createContext }          from 'react';
import type { DashboardEventHub } from './DashboardEventHub.ts';

/** The page's one event stream, which every shown conversation subscribes to; null outside the app. */
export const DashboardEventHubContext = createContext<DashboardEventHub | null>(null);
