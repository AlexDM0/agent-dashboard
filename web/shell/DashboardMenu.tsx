import type { MenuActionVerdict }              from '../menu/MenuStepUtil.ts';
import { PopoverMenu, type PopoverMenuAction } from '../menu/PopoverMenu.tsx';
import { requestServerRestart }                from './ServerRestartRequest.ts';

async function restartServer(): Promise<MenuActionVerdict> {
  const verdict = await requestServerRestart();
  return verdict.kind === 'restarting' ? { kind: 'done' } : verdict;
}

const DASHBOARD_MENU_ACTIONS: PopoverMenuAction[] = [{
  id:            'restart-server',
  label:         'Restart server',
  description:   'Restarts the dashboard server on the same ports, and this page reconnects by itself.',
  question:      'Restart the dashboard server?',
  confirmLabel:  'Restart',
  isHighlighted: false,
  run:           restartServer,
}];

/** The header's menu at its left edge, before the title: one action, a confirmed restart of the dashboard server. */
export function DashboardMenu() {
  return <PopoverMenu label="Dashboard menu" actions={DASHBOARD_MENU_ACTIONS} hasWarning={false} />;
}
