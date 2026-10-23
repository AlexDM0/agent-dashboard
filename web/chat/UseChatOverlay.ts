import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import type { DockedWaiting } from './WaitingForYouUtil.ts';

export type ChatOverlayVisibility = 'closed' | 'open';

export interface ChatOverlay {
  visibility:          ChatOverlayVisibility;
  /** The listed conversation shown, kept across a close; null picks the list's first. */
  selectedKey:         string | null;
  /** The waiting entry the session was picked for; null when it was picked as a session. */
  docked:              DockedWaiting | null;
  chatButtonReference: RefObject<HTMLButtonElement | null>;
  /** Opens the window, on the given session when one is named, else on the one shown last. */
  open:                (key?: string | null, docked?: DockedWaiting | null) => void;
  /** Closes the window, the session living on, and gives focus back to the header's Chat button. */
  close:               () => void;
  select:              (key: string, docked?: DockedWaiting | null) => void;
}

const OPEN_KEY = 'c';

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    || (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type));
}

/** The chat window's visibility and selection, `C` outside a text field opening it, and Esc closing it on any route. */
export function useChatOverlay(): ChatOverlay {
  const [visibility, setVisibility] = useState<ChatOverlayVisibility>('closed');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [docked, setDocked] = useState<DockedWaiting | null>(null);
  const chatButtonReference = useRef<HTMLButtonElement | null>(null);

  const select = useCallback((key: string, dockedWaiting: DockedWaiting | null = null) => {
    setSelectedKey(key);
    setDocked(dockedWaiting);
  }, []);
  const open = useCallback((key?: string | null, dockedWaiting: DockedWaiting | null = null) => {
    if (typeof key === 'string') select(key, dockedWaiting);
    setVisibility('open');
  }, [select]);
  const close = useCallback(() => {
    setVisibility('closed');
    chatButtonReference.current?.focus();
  }, []);

  useEffect(() => {
    const openOnKey = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== OPEN_KEY || event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) return;
      event.preventDefault();
      setVisibility('open');
    };
    window.addEventListener('keydown', openOnKey);
    return () => window.removeEventListener('keydown', openOnKey);
  }, []);

  useEffect(() => {
    if (visibility !== 'open') return undefined;
    // Captured on the window before anything else hears it, so the crew drawer's and the board's own Esc never see it.
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.stopPropagation();
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [visibility, close]);

  return {
    visibility, selectedKey, docked, chatButtonReference, open, close, select
  };
}
