import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

export type ChatOverlayVisibility = 'closed' | 'open';

/** Text put into a session's composer from outside it; `serial` tells two equal seeds apart, so each refills the composer. */
export interface ComposerSeed {
  key:    string;
  text:   string;
  serial: number;
}

export interface ChatOverlay {
  visibility:             ChatOverlayVisibility;
  /** The listed conversation shown, kept across a close; null picks the list's first. */
  selectedKey:            string | null;
  composerSeed:           ComposerSeed | null;
  chatButtonReference:    RefObject<HTMLButtonElement | null>;
  /** Opens the window, on the given session when one is named, else on the one shown last. */
  open:                   (key?: string | null) => void;
  /** Closes the window, the session living on, and gives focus back to the header's Chat button. */
  close:                  () => void;
  select:                 (key: string) => void;
  /** Selects the session with the text put into its composer. */
  selectWithComposerText: (key: string, text: string) => void;
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
  const [composerSeed, setComposerSeed] = useState<ComposerSeed | null>(null);
  const chatButtonReference = useRef<HTMLButtonElement | null>(null);

  // A seed is spent once its session is left or the window closes, so coming back never refills the composer with it.
  const select = useCallback((key: string) => {
    setSelectedKey(key);
    setComposerSeed((previous) => (previous === null || previous.key === key ? previous : null));
  }, []);
  const open = useCallback((key?: string | null) => {
    if (typeof key === 'string') select(key);
    setVisibility('open');
  }, [select]);
  const close = useCallback(() => {
    setVisibility('closed');
    setComposerSeed(null);
    chatButtonReference.current?.focus();
  }, []);
  const selectWithComposerText = useCallback((key: string, text: string) => {
    setSelectedKey(key);
    setComposerSeed((previous) => ({ key, text, serial: (previous?.serial ?? 0) + 1 }));
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
    visibility, selectedKey, composerSeed, chatButtonReference, open, close, select, selectWithComposerText
  };
}
