import { type KeyboardEvent, useRef }                            from 'react';
import { type ResolvedTheme, type ThemeChoice, ThemeChoiceUtil } from '../preferences/ThemeChoiceUtil.ts';

interface ThemeToggleProperties {
  choice:        ThemeChoice;
  resolvedTheme: ResolvedTheme;
  onChoose:      (choice: ThemeChoice) => void;
}

const CHOICES: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: 'auto', label: 'Auto' },
  { choice: 'light', label: 'Light' },
  { choice: 'dark', label: 'Dark' },
];

/** The template's three-way radio on a wide screen; on a phone one button flips between light and dark (the stylesheet shows one). */
export function ThemeToggle({ choice, resolvedTheme, onChoose }: ThemeToggleProperties) {
  const opposite: ResolvedTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
  const groupReference = useRef<HTMLDivElement | null>(null);

  // A radio group is one tab stop, the checked radio; the arrow keys move the choice, as in the embedded page's toggle.
  const walkWithArrowKeys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const nextChoice = ThemeChoiceUtil.choiceAfterKey(choice, event.key);
    if (nextChoice === null) {
      return;
    }
    event.preventDefault();
    onChoose(nextChoice);
    groupReference.current?.querySelector<HTMLButtonElement>(`[data-choice="${nextChoice}"]`)?.focus();
  };

  return (
    <>
      <div className="ap-theme" role="radiogroup" aria-label="Theme" ref={groupReference} onKeyDown={walkWithArrowKeys}>
        {CHOICES.map((entry) => (
          <button
            key={entry.choice}
            type="button"
            role="radio"
            aria-checked={entry.choice === choice}
            tabIndex={entry.choice === choice ? 0 : -1}
            data-choice={entry.choice}
            onClick={() => onChoose(entry.choice)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <button className="ap-theme-icon" type="button" aria-label={`Switch to ${opposite} theme`} onClick={() => onChoose(opposite)}>
        {resolvedTheme === 'dark'
          ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          )
          : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )}
      </button>
    </>
  );
}
