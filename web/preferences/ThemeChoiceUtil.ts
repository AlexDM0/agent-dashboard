export type ThemeChoice = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** The key every agent-progress page reads, so the dashboard and the boards it embeds share one choice. */
export const THEME_STORAGE_KEY = 'agent-progress:theme';

/** The order the toggle shows them in, which the arrow keys walk. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

const STEP_BY_ARROW_KEY: Readonly<Record<string, number>> = {
  ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1
};

function choiceOf(storedText: string | null): ThemeChoice {
  return storedText === 'light' || storedText === 'dark' ? storedText : 'auto';
}

function resolvedThemeOf(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'auto') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return choice;
}

/** The radio-group walk the embedded page's own toggle makes: an arrow key moves to the neighbour, wrapping; any other key, null. */
function choiceAfterKey(choice: ThemeChoice, key: string): ThemeChoice | null {
  if (!Object.hasOwn(STEP_BY_ARROW_KEY, key)) {
    return null;
  }
  const step = STEP_BY_ARROW_KEY[key] ?? 0;
  const nextIndex = (THEME_CHOICES.indexOf(choice) + step + THEME_CHOICES.length) % THEME_CHOICES.length;
  return THEME_CHOICES[nextIndex] ?? choice;
}

export const ThemeChoiceUtil = Object.freeze({ choiceOf, resolvedThemeOf, choiceAfterKey });
