import { type ThemeChoice, ThemeChoiceUtil } from '../preferences/ThemeChoiceUtil.ts';

interface ThemeToggleProperties {
  choice:   ThemeChoice;
  onChoose: (choice: ThemeChoice) => void;
}

const SUN_RAYS = 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4';
const LEFT_SUN_RAYS = 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M2 12h2M4.9 19.1l1.4-1.4';
const MOON = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';

function ThemeChoiceIcon({ choice }: { choice: ThemeChoice }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" data-icon={choice}>
      {choice === 'light' ? <><circle cx="12" cy="12" r="4" /><path d={SUN_RAYS} /></> : null}
      {choice === 'dark' ? <path d={MOON} /> : null}
      {choice === 'auto'
        ? <><circle cx="12" cy="12" r="5" /><path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" /><path d={LEFT_SUN_RAYS} /></>
        : null}
    </svg>
  );
}

/** One square button showing the current theme; each click moves to the next, auto, light, dark and around. */
export function ThemeToggle({ choice, onChoose }: ThemeToggleProperties) {
  const label = ThemeChoiceUtil.buttonLabelOf(choice);
  return (
    <button
      type="button"
      className="ap-control ap-theme-toggle"
      data-choice={choice}
      title={label}
      aria-label={label}
      onClick={() => onChoose(ThemeChoiceUtil.choiceAfterClick(choice))}
    >
      <ThemeChoiceIcon choice={choice} />
    </button>
  );
}
