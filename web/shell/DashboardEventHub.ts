/**
 * The page's one event stream to the dashboard: the snapshot and every conversation a card shows. A subscription change
 * reopens that one stream with the new query, so the server replays each conversation's history before its live messages.
 */
import type {
  ChatMessage,
  ConversationHistoryEvent,
  ConversationMessageEvent,
  ConversationSubscription,
  DashboardSnapshot,
  SessionRole
} from '../../src/shared/DashboardContract.ts';
import { DASHBOARD_ENDPOINTS } from '../constants/DashboardEndpoints.ts';
import { WEB_LIMITS }          from '../constants/WebLimits.ts';

/** The part of the browser's `EventSource` the hub uses. */
export interface EventSourceLike {
  readonly readyState: number;
  addEventListener(eventName: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

/** `EventSource.CLOSED`: the browser gave up retrying. */
const CLOSED_READY_STATE = 2;

export type ConversationListener = (messages: ChatMessage[]) => void;

export interface DashboardEventHubOptions {
  openEventSource:  (path: string) => EventSourceLike;
  setTimer:         (task: () => void, delayMilliseconds: number) => number;
  clearTimer:       (timer: number) => void;
  /** `connectionNumber` grows each time the stream is opened afresh; a reopen for a subscription change keeps it. */
  onSnapshot:       (snapshot: DashboardSnapshot, connectionNumber: number) => void;
  onConnectionLost: () => void;
}

export interface DashboardEventHub {
  connect():    void;
  disconnect(): void;
  /** Called at once with the messages held, then on every change; returns the unsubscribe. */
  subscribeToConversation(role: SessionRole, trackerId: string, listener: ConversationListener): () => void;
}

interface HeldConversation {
  subscription: ConversationSubscription;
  listeners:    Set<ConversationListener>;
  messages:     ChatMessage[];
}

export function dashboardEventsPathOf(subscriptions: readonly ConversationSubscription[]): string {
  const query = new URLSearchParams(subscriptions.map(({ role, trackerId }) => [role, trackerId])).toString();
  return query === '' ? DASHBOARD_ENDPOINTS.EVENTS_PATH : `${DASHBOARD_ENDPOINTS.EVENTS_PATH}?${query}`;
}

function conversationKeyOf(role: SessionRole, trackerId: string): string {
  return JSON.stringify([role, trackerId]);
}

export function createDashboardEventHub(options: DashboardEventHubOptions): DashboardEventHub {
  const conversations = new Map<string, HeldConversation>();
  let source: EventSourceLike | null = null;
  let openPath: string | null = null;
  let isWanted = false;
  let retryTimer: number | null = null;
  let reopenTimer: number | null = null;
  let connectionNumber = 0;
  let countsNextOpen = true;

  function currentPath(): string {
    return dashboardEventsPathOf([...conversations.values()].map((conversation) => conversation.subscription));
  }

  function update(role: SessionRole, trackerId: string, messagesOf: (held: ChatMessage[]) => ChatMessage[]): void {
    const conversation = conversations.get(conversationKeyOf(role, trackerId));
    if (conversation === undefined) return;
    conversation.messages = messagesOf(conversation.messages).slice(-WEB_LIMITS.MAXIMUM_SHOWN_CONVERSATION_MESSAGES);
    for (const listener of conversation.listeners) listener(conversation.messages);
  }

  function open(isFreshConnection: boolean): void {
    source?.close();
    const path = currentPath();
    const opened = options.openEventSource(path);
    source = opened;
    openPath = path;
    // Before the first open the page has no stream snapshot yet, so even a subscription reopen starts connection 1.
    countsNextOpen = isFreshConnection || connectionNumber === 0;
    const isCurrent = (): boolean => source === opened;
    // The browser's own retry of a dropped stream opens it again too, and its first snapshot is a fresh baseline.
    opened.addEventListener('open', () => {
      if (!isCurrent()) return;
      if (countsNextOpen) connectionNumber += 1;
      countsNextOpen = true;
    });
    opened.addEventListener(DASHBOARD_ENDPOINTS.SNAPSHOT_EVENT_NAME, (event) => {
      if (isCurrent()) options.onSnapshot(JSON.parse(String(event.data)) as DashboardSnapshot, connectionNumber);
    });
    opened.addEventListener(DASHBOARD_ENDPOINTS.CONVERSATION_HISTORY_EVENT_NAME, (event) => {
      const { role, trackerId, messages } = JSON.parse(String(event.data)) as ConversationHistoryEvent;
      if (isCurrent()) update(role, trackerId, () => messages);
    });
    opened.addEventListener(DASHBOARD_ENDPOINTS.CONVERSATION_MESSAGE_EVENT_NAME, (event) => {
      const { role, trackerId, message } = JSON.parse(String(event.data)) as ConversationMessageEvent;
      if (isCurrent()) update(role, trackerId, (held) => [...held, message]);
    });
    opened.addEventListener('error', () => {
      if (!isCurrent()) return;
      options.onConnectionLost();
      if (opened.readyState !== CLOSED_READY_STATE) return;
      opened.close();
      source = null;
      openPath = null;
      retryTimer = options.setTimer(() => {
        retryTimer = null;
        if (isWanted) open(true);
      }, WEB_LIMITS.STREAM_RETRY_DELAY_MILLISECONDS);
    });
  }

  /** Coalesced, so the cards one render mounts reopen the stream once; a stream waiting on its retry takes the new path then. */
  function scheduleReopen(): void {
    if (reopenTimer !== null) return;
    reopenTimer = options.setTimer(() => {
      reopenTimer = null;
      if (isWanted && source !== null && currentPath() !== openPath) open(false);
    }, 0);
  }

  function clearTimers(): void {
    for (const timer of [retryTimer, reopenTimer]) if (timer !== null) options.clearTimer(timer);
    retryTimer = null;
    reopenTimer = null;
  }

  return {
    connect() {
      if (isWanted) return;
      isWanted = true;
      open(true);
    },
    disconnect() {
      isWanted = false;
      clearTimers();
      source?.close();
      source = null;
      openPath = null;
    },
    subscribeToConversation(role, trackerId, listener) {
      const key = conversationKeyOf(role, trackerId);
      let conversation = conversations.get(key);
      if (conversation === undefined) {
        conversation = { subscription: { role, trackerId }, listeners: new Set(), messages: [] };
        conversations.set(key, conversation);
        scheduleReopen();
      }
      const held = conversation;
      held.listeners.add(listener);
      listener(held.messages);
      return () => {
        held.listeners.delete(listener);
        if (held.listeners.size > 0 || conversations.get(key) !== held) return;
        conversations.delete(key);
        scheduleReopen();
      };
    },
  };
}
