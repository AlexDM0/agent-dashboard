import type { MouseEvent } from 'react';
import { boardHashOf }     from '../shell/HashRoute.ts';

/** The whole card opens the board; a click on a link or button inside it keeps its own meaning. */
export function openBoardFromCardClick(event: MouseEvent<HTMLElement>, trackerId: string): void {
  if (event.target instanceof Element && event.target.closest('a, button') !== null) {
    return;
  }
  window.location.hash = boardHashOf(trackerId);
}
