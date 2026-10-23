/**
 * A stored value the dashboard does not know reads as auto, the way the template's head script reads it, and the values
 * the old segmented control stored still read as themselves. The theme button cycles auto, light, dark and back, and
 * names the current choice and the next one, since a single icon shows neither on its own.
 */
import { expect, test }                      from 'bun:test';
import { type ThemeChoice, ThemeChoiceUtil } from './ThemeChoiceUtil.ts';

test('light and dark are kept, anything else is auto', () => {
  expect(ThemeChoiceUtil.choiceOf('light')).toBe('light');
  expect(ThemeChoiceUtil.choiceOf('dark')).toBe('dark');
  expect(ThemeChoiceUtil.choiceOf('sepia')).toBe('auto');
  expect(ThemeChoiceUtil.choiceOf(null)).toBe('auto');
});

test('every value the old segmented control stored reads back as the same choice after a reload', () => {
  for (const storedByOldControl of ['auto', 'light', 'dark'] as const) {
    expect(ThemeChoiceUtil.choiceOf(storedByOldControl)).toBe(storedByOldControl);
  }
});

test('auto follows the system and an explicit choice ignores it', () => {
  expect(ThemeChoiceUtil.resolvedThemeOf('auto', true)).toBe('dark');
  expect(ThemeChoiceUtil.resolvedThemeOf('auto', false)).toBe('light');
  expect(ThemeChoiceUtil.resolvedThemeOf('light', true)).toBe('light');
});

test('a click moves auto to light, light to dark and dark back to auto', () => {
  expect(ThemeChoiceUtil.choiceAfterClick('auto')).toBe('light');
  expect(ThemeChoiceUtil.choiceAfterClick('light')).toBe('dark');
  expect(ThemeChoiceUtil.choiceAfterClick('dark')).toBe('auto');
});

test('three clicks return to the starting choice through the other two', () => {
  const visited: ThemeChoice[] = ['auto'];
  for (let i = 0; i < 3; i++) {
    visited.push(ThemeChoiceUtil.choiceAfterClick(visited[visited.length - 1] ?? 'auto'));
  }
  expect(visited).toEqual(['auto', 'light', 'dark', 'auto']);
});

test('the button label names the current choice and the one a click switches to', () => {
  expect(ThemeChoiceUtil.buttonLabelOf('auto')).toBe('Theme: Auto — click for Light');
  expect(ThemeChoiceUtil.buttonLabelOf('light')).toBe('Theme: Light — click for Dark');
  expect(ThemeChoiceUtil.buttonLabelOf('dark')).toBe('Theme: Dark — click for Auto');
});
