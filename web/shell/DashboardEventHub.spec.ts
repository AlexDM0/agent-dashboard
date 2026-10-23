/**
 * The page's one event stream against a recording stand-in for `EventSource` and hand-run timers. The cases are the
 * promises that keep a page to one connection: the cards one render mounts share one stream, opened with all of them;
 * a card shown or hidden reopens that stream (the old one closed first) rather than opening another; a conversation
 * shows its history and then its live messages, and nothing once its card is gone; a subscription reopen keeps the
 * connection number, so notifications are not re-baselined, while a retry after the browser gave up starts a new one;
 * and a disconnect, which the page makes on `pagehide`, leaves no stream open and no timer pending.
 */
import { expect, test }                        from 'bun:test';
import type { ChatMessage, DashboardSnapshot } from '../../src/shared/DashboardContract.ts';
import {
  type DashboardEventHub,
  type EventSourceLike,
  createDashboardEventHub,
  dashboardEventsPathOf
} from './DashboardEventHub.ts';

const CLOSED_READY_STATE = 2;

interface FakeEventSource extends EventSourceLike {
  path:       string;
  isClosed:   boolean;
  readyState: number;
  emit(eventName: string, data?: unknown): void;
}

interface HubFixture {
  hub:               DashboardEventHub;
  sources:           FakeEventSource[];
  openSources:       () => FakeEventSource[];
  runTimers:         () => void;
  pendingTimerCount: () => number;
  snapshots:         { snapshot: DashboardSnapshot; connectionNumber: number }[];
}

function hubFixture(): HubFixture {
  const sources: FakeEventSource[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  const snapshots: HubFixture['snapshots'] = [];
  const hub = createDashboardEventHub({
    openEventSource(path) {
      const listenersByEvent = new Map<string, ((event: MessageEvent) => void)[]>();
      const source: FakeEventSource = {
        path,
        isClosed:   false,
        readyState: 0,
        addEventListener(eventName, listener) {
          listenersByEvent.set(eventName, [...listenersByEvent.get(eventName) ?? [], listener]);
        },
        close() {
          source.isClosed = true;
          source.readyState = CLOSED_READY_STATE;
        },
        emit(eventName, data) {
          const event = new MessageEvent(eventName, { data: data === undefined ? '' : JSON.stringify(data) });
          for (const listener of listenersByEvent.get(eventName) ?? []) listener(event);
        },
      };
      sources.push(source);
      return source;
    },
    setTimer(task) {
      const timer = nextTimer++;
      timers.set(timer, task);
      return timer;
    },
    clearTimer:       (timer) => timers.delete(timer),
    onSnapshot:       (snapshot, connectionNumber) => snapshots.push({ snapshot, connectionNumber }),
    onConnectionLost: () => undefined,
  });
  return {
    hub,
    sources,
    openSources: () => sources.filter((source) => !source.isClosed),
    runTimers() {
      const due = [...timers.entries()];
      timers.clear();
      for (const [, task] of due) task();
    },
    pendingTimerCount: () => timers.size,
    snapshots,
  };
}

const EXAMPLE_SNAPSHOT = { projects: [] } as unknown as DashboardSnapshot;

function exampleMessage(text: string): ChatMessage {
  return { at: '2026-10-23T12:00:00.000Z', role: 'assistant', text };
}

test('the path names each subscription by its role and encodes the tracker id', () => {
  expect(dashboardEventsPathOf([])).toBe('/api/events');
  expect(dashboardEventsPathOf([{ role: 'orchestrator', trackerId: 'example project/one' }, { role: 'product-owner', trackerId: 'tracker-example' }]))
    .toBe('/api/events?orchestrator=example+project%2Fone&product-owner=tracker-example');
});

test('the cards one render mounts share the one stream, opened with all of them', () => {
  const fixture = hubFixture();
  fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', () => undefined);
  fixture.hub.subscribeToConversation('product-owner', 'tracker-a', () => undefined);
  fixture.hub.connect();
  fixture.runTimers();
  expect(fixture.sources.map((source) => source.path)).toEqual(['/api/events?orchestrator=tracker-a&product-owner=tracker-a']);
});

test('a card shown or hidden reopens the one stream, closing the old one, never opening a second', () => {
  const fixture = hubFixture();
  fixture.hub.connect();
  const unsubscribe = fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', () => undefined);
  fixture.hub.subscribeToConversation('orchestrator', 'tracker-b', () => undefined);
  fixture.runTimers();
  expect(fixture.openSources().map((source) => source.path)).toEqual(['/api/events?orchestrator=tracker-a&orchestrator=tracker-b']);
  unsubscribe();
  fixture.runTimers();
  expect(fixture.openSources().map((source) => source.path)).toEqual(['/api/events?orchestrator=tracker-b']);
  expect(fixture.sources).toHaveLength(3);
});

test('a conversation shows its history, then its live messages, and nothing once its card is gone', () => {
  const fixture = hubFixture();
  const received: string[][] = [];
  fixture.hub.connect();
  const unsubscribe = fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', (messages) => received.push(messages.map((message) => message.text)));
  fixture.runTimers();
  const [, stream] = fixture.sources;
  if (stream === undefined) throw new Error('the subscription did not reopen the stream');
  stream.emit('conversation-history', { role: 'orchestrator', trackerId: 'tracker-a', messages: [exampleMessage('first'), exampleMessage('second')] });
  stream.emit('conversation-message', { role: 'orchestrator', trackerId: 'tracker-a', message: exampleMessage('third') });
  stream.emit('conversation-message', { role: 'product-owner', trackerId: 'tracker-a', message: exampleMessage('another role') });
  expect(received).toEqual([[], ['first', 'second'], ['first', 'second', 'third']]);

  unsubscribe();
  stream.emit('conversation-message', { role: 'orchestrator', trackerId: 'tracker-a', message: exampleMessage('after') });
  expect(received).toHaveLength(3);
});

test('a second card on a held conversation gets its messages at once, without a reopen', () => {
  const fixture = hubFixture();
  fixture.hub.connect();
  fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', () => undefined);
  fixture.runTimers();
  fixture.sources[1]?.emit('conversation-history', { role: 'orchestrator', trackerId: 'tracker-a', messages: [exampleMessage('first')] });
  const received: string[][] = [];
  fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', (messages) => received.push(messages.map((message) => message.text)));
  fixture.runTimers();
  expect(received).toEqual([['first']]);
  expect(fixture.sources).toHaveLength(2);
});

test('a subscription reopen keeps the connection number; a retry after the browser gave up starts a new one', () => {
  const fixture = hubFixture();
  fixture.hub.connect();
  fixture.sources[0]?.emit('open');
  fixture.sources[0]?.emit('snapshot', EXAMPLE_SNAPSHOT);
  fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', () => undefined);
  fixture.runTimers();
  fixture.sources[1]?.emit('open');
  fixture.sources[1]?.emit('snapshot', EXAMPLE_SNAPSHOT);

  const reopened = fixture.sources[1];
  if (reopened === undefined) throw new Error('the subscription did not reopen the stream');
  reopened.readyState = CLOSED_READY_STATE;
  reopened.emit('error');
  fixture.runTimers();
  expect(fixture.sources[2]?.path).toBe('/api/events?orchestrator=tracker-a');
  fixture.sources[2]?.emit('open');
  fixture.sources[2]?.emit('snapshot', EXAMPLE_SNAPSHOT);
  expect(fixture.snapshots.map((delivered) => delivered.connectionNumber)).toEqual([1, 1, 2]);
});

test('a disconnect, as on pagehide, leaves no stream open and no timer pending, and ignores the closed stream', () => {
  const fixture = hubFixture();
  fixture.hub.connect();
  fixture.hub.subscribeToConversation('orchestrator', 'tracker-a', () => undefined);
  fixture.hub.disconnect();
  expect(fixture.openSources()).toEqual([]);
  expect(fixture.pendingTimerCount()).toBe(0);
  fixture.sources[0]?.emit('snapshot', EXAMPLE_SNAPSHOT);
  expect(fixture.snapshots).toEqual([]);
});
