/**
 * A stored value the dashboard does not know reads as auto, the way the template's head script reads it; the arrow keys
 * walk the choices the way the template's own radio group does, so the two copies of the toggle behave alike.
 */
import { expect, test }    from 'bun:test';
import { ThemeChoiceUtil } from './ThemeChoiceUtil.ts';

test('light and dark are kept, anything else is auto', () => {
  expect(ThemeChoiceUtil.choiceOf('light')).toBe('light');
  expect(ThemeChoiceUtil.choiceOf('dark')).toBe('dark');
  expect(ThemeChoiceUtil.choiceOf('sepia')).toBe('auto');
  expect(ThemeChoiceUtil.choiceOf(null)).toBe('auto');
});

test('auto follows the system and an explicit choice ignores it', () => {
  expect(ThemeChoiceUtil.resolvedThemeOf('auto', true)).toBe('dark');
  expect(ThemeChoiceUtil.resolvedThemeOf('auto', false)).toBe('light');
  expect(ThemeChoiceUtil.resolvedThemeOf('light', true)).toBe('light');
});

test('the arrow keys walk auto, light, dark and wrap; any other key is no move', () => {
  expect(ThemeChoiceUtil.choiceAfterKey('auto', 'ArrowRight')).toBe('light');
  expect(ThemeChoiceUtil.choiceAfterKey('light', 'ArrowDown')).toBe('dark');
  expect(ThemeChoiceUtil.choiceAfterKey('dark', 'ArrowRight')).toBe('auto');
  expect(ThemeChoiceUtil.choiceAfterKey('auto', 'ArrowLeft')).toBe('dark');
  expect(ThemeChoiceUtil.choiceAfterKey('light', 'ArrowUp')).toBe('auto');
  expect(ThemeChoiceUtil.choiceAfterKey('light', 'Enter')).toBeNull();
  expect(ThemeChoiceUtil.choiceAfterKey('light', 'toString')).toBeNull();
});
