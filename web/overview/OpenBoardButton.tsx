import { boardHashOf } from '../shell/HashRoute.ts';

interface OpenBoardButtonProperties {
  trackerId:   string;
  projectName: string;
}

export function OpenBoardButton({ trackerId, projectName }: OpenBoardButtonProperties) {
  return (
    <a className="ap-button ap-open-board" data-primary="" href={boardHashOf(trackerId)} aria-label={`Open board of ${projectName}`}>
      Open board
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </a>
  );
}
