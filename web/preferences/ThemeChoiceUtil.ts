export type ThemeChoice = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** The key every agent-progress page reads, so the dashboard and the boards it embeds share one choice. */
export const THEME_STORAGE_KEY = 'agent-progress:theme';

/** The order the theme button cycles through, one step per click, wrapping. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['auto', 'light', 'dark'];

const THEME_CHOICE_WORDS: Readonly<Record<ThemeChoice, string>> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

function choiceOf(storedText: string | null): ThemeChoice {
  return storedText === 'light' || storedText === 'dark' ? storedText : 'auto';
}

function resolvedThemeOf(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'auto') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return choice;
}

function choiceAfterClick(choice: ThemeChoice): ThemeChoice {
  const nextIndex = (THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length;
  return THEME_CHOICES[nextIndex] ?? choice;
}

/** The theme button's tooltip and accessible name: the current choice and the one a click switches to. */
function buttonLabelOf(choice: ThemeChoice): string {
  return `Theme: ${THEME_CHOICE_WORDS[choice]} — click for ${THEME_CHOICE_WORDS[choiceAfterClick(choice)]}`;
}

export const ThemeChoiceUtil = Object.freeze({
  choiceOf, resolvedThemeOf, choiceAfterClick, buttonLabelOf
});
