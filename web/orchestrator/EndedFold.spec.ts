/**
 * Both views read as static markup with one live and two ended sessions: the crew drawer and the chat overlay's list
 * render the live session above a closed "Ended (2)" fold holding the ended ones, and no fold at all without one.
 */
import { expect, test }         from 'bun:test';
import { createElement }        from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ChatConversationListUtil }                     from '../chat/ChatConversationListUtil.ts';
import { ConversationList }                             from '../chat/ConversationList.tsx';
import { orchestratorSessionWith, projectSnapshotWith } from '../testing/SnapshotFixtures.ts';
import { CrewDrawer }                                   from './CrewDrawer.tsx';

const LIVE_WATCHED = orchestratorSessionWith({
  ownership: 'watched', sessionId: 'watched-live', name: 'Example live desktop', state: 'busy'
});
const ENDED_WATCHED = orchestratorSessionWith({
  ownership: 'watched', sessionId: 'watched-ended', name: 'Example ended desktop', state: 'ended'
});
const ENDED_DASHBOARD = orchestratorSessionWith({ sessionId: 'dashboard-ended', state: 'ended', lastAction: { at: '2026-10-21T11:00:00Z', text: 'wrapped up' } });

const PROJECT_WITH_ENDED = projectSnapshotWith('example-project', { orchestrator: ENDED_DASHBOARD });
const PROJECT_WITHOUT_ENDED = projectSnapshotWith('example-project', { orchestrator: null });

function drawerMarkupOf(project: typeof PROJECT_WITH_ENDED, watchedSessions: typeof LIVE_WATCHED[]): string {
  return renderToStaticMarkup(createElement(CrewDrawer, {
    drawerId: 'crew-example', project, watchedSessions, initialFocus: 'close', initialTab: 'orchestrator', onClose: () => undefined
  }));
}

function listMarkupOf(project: typeof PROJECT_WITH_ENDED, watchedSessions: typeof LIVE_WATCHED[]): string {
  const conversations = ChatConversationListUtil.conversationsOf([project], { [project.trackerId]: watchedSessions });
  return renderToStaticMarkup(createElement(ConversationList, {
    projects: [project], conversations, selectedKey: null, onSelect: () => undefined
  }));
}

function textBeforeFoldOf(markup: string): string {
  const foldIndex = markup.indexOf('ap-ended-fold');
  return foldIndex === -1 ? markup : markup.slice(0, foldIndex);
}

test('the drawer renders the live session as a card and both ended ones only inside a closed Ended (2) fold', () => {
  const markup = drawerMarkupOf(PROJECT_WITH_ENDED, [LIVE_WATCHED, ENDED_WATCHED]);
  expect(textBeforeFoldOf(markup)).toContain('Example live desktop');
  expect(textBeforeFoldOf(markup)).not.toContain('Example ended desktop');
  expect(textBeforeFoldOf(markup)).not.toContain('Dashboard orchestrator');
  expect(markup).toContain('<details class="ap-ended-fold"><summary class="ap-ended-fold-summary">Ended (2)</summary>');
  expect(markup.indexOf('Dashboard orchestrator')).toBeLessThan(markup.indexOf('Example ended desktop'));
  expect(markup).not.toContain('This session has ended');
});

test('an ended line in the drawer stays closed, rendering no card and no composer until opened', () => {
  const markup = drawerMarkupOf(PROJECT_WITH_ENDED, [LIVE_WATCHED, ENDED_WATCHED]);
  const foldMarkup = markup.slice(markup.indexOf('ap-ended-fold'));
  expect(foldMarkup).not.toContain(' open');
  expect(foldMarkup).not.toContain('ap-session-head');
  expect(foldMarkup).not.toContain('ap-chat-input');
});

test('the chat list renders the live conversation and both ended ones only inside a closed Ended (2) fold', () => {
  const markup = listMarkupOf(PROJECT_WITH_ENDED, [LIVE_WATCHED, ENDED_WATCHED]);
  expect(textBeforeFoldOf(markup)).toContain('Example live desktop');
  expect(textBeforeFoldOf(markup)).not.toContain('Example ended desktop');
  expect(textBeforeFoldOf(markup)).not.toContain('data-ended="true"');
  expect(markup).toContain('<details class="ap-ended-fold"><summary class="ap-ended-fold-summary">Ended (2)</summary>');
});

test('with no ended session neither view renders a fold', () => {
  expect(drawerMarkupOf(PROJECT_WITHOUT_ENDED, [LIVE_WATCHED])).not.toContain('ap-ended-fold');
  expect(listMarkupOf(PROJECT_WITHOUT_ENDED, [LIVE_WATCHED])).not.toContain('ap-ended-fold');
});
