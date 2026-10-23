import type { SessionRole } from '../DashboardContract.ts';

/** Every role a dashboard-owned session is started in, for checking a role read from a record or a command line. */
export const SESSION_ROLES: readonly SessionRole[] = ['orchestrator', 'product-owner'];
