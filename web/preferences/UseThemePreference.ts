import { useCallback, useEffect, useState } from 'react';
import { applyThemeToEmbeddedBoards }       from './EmbeddedBoardTheme.ts';
import { PreferenceStore }                  from './PreferenceStore.ts';
import {
  type ResolvedTheme,
  THEME_STORAGE_KEY,
  type ThemeChoice,
  ThemeChoiceUtil
} from './ThemeChoiceUtil.ts';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

export interface ThemePreference {
  choice:        ThemeChoice;
  resolvedTheme: ResolvedTheme;
  chooseTheme:   (choice: ThemeChoice) => void;
}

/** The dashboard's theme: applied to `<html>`, written to the shared key, and followed when an embedded board's own toggle writes it. */
export function useThemePreference(): ThemePreference {
  const [choice, setChoice] = useState<ThemeChoice>(() => ThemeChoiceUtil.choiceOf(PreferenceStore.readText(THEME_STORAGE_KEY)));
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => window.matchMedia(DARK_SCHEME_QUERY).matches);
  const resolvedTheme = ThemeChoiceUtil.resolvedThemeOf(choice, systemPrefersDark);

  useEffect(() => {
    const darkScheme = window.matchMedia(DARK_SCHEME_QUERY);
    const followSystem = (): void => setSystemPrefersDark(darkScheme.matches);
    darkScheme.addEventListener('change', followSystem);
    return () => darkScheme.removeEventListener('change', followSystem);
  }, []);

  useEffect(() => {
    const followStoredChoice = (event: StorageEvent): void => {
      if (event.key === THEME_STORAGE_KEY) {
        setChoice(ThemeChoiceUtil.choiceOf(event.newValue));
      }
    };
    window.addEventListener('storage', followStoredChoice);
    return () => window.removeEventListener('storage', followStoredChoice);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-theme-choice', choice);
  }, [choice, resolvedTheme]);

  // Every path to a new choice reaches the open board: this toggle, and a change written in another tab. A board whose
  // own toggle wrote it already shows it, and clicking its selected radio again changes nothing.
  useEffect(() => {
    applyThemeToEmbeddedBoards(choice);
  }, [choice]);

  const chooseTheme = useCallback((nextChoice: ThemeChoice) => {
    setChoice(nextChoice);
    PreferenceStore.writeText(THEME_STORAGE_KEY, nextChoice);
  }, []);

  return { choice, resolvedTheme, chooseTheme };
}
