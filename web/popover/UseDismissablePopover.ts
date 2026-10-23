import { type RefObject, useEffect } from 'react';
import { isPressOutside }            from './PressOutside.ts';

interface DismissablePopover {
  isOpen:             boolean;
  containerReference: RefObject<HTMLElement | null>;
  toggleReference:    RefObject<HTMLElement | null>;
  close:              () => void;
}

/** While open, Escape (focus back on the toggle), the window losing focus and a press outside the container close the popover. */
export function useDismissablePopover({
  isOpen, containerReference, toggleReference, close
}: DismissablePopover): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    // Captured on the window, so the board's own Esc (back to the overview) never sees the key that closes the popover.
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      close();
      toggleReference.current?.focus();
    };
    // Focus moving into the board frame blurs this window; the board's own Esc must not then find the popover open.
    const closeOnLeave = (): void => close();
    const closeOnPressOutside = (event: PointerEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (isPressOutside(containerReference.current, target)) close();
    };
    window.addEventListener('keydown', closeOnEscape, true);
    window.addEventListener('blur', closeOnLeave);
    document.addEventListener('pointerdown', closeOnPressOutside, true);
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true);
      window.removeEventListener('blur', closeOnLeave);
      document.removeEventListener('pointerdown', closeOnPressOutside, true);
    };
  }, [isOpen]);
}
