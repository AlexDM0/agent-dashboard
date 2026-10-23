/**
 * How the command bar shortens a project root: the home is read off the registry path, a root under it reads `~/…`,
 * and a root elsewhere, a mere prefix match on the home's name, or an unknown home keeps the full path.
 */
import { expect, test } from 'bun:test';
import { RootPathUtil } from './RootPathUtil.ts';

const HOME = '/Users/alex.example';

test('the home is the folder holding the registry folder', () => {
  expect(RootPathUtil.homeDirectoryOf(`${HOME}/.agent-progress-monitor/projects.json`)).toBe(HOME);
});

test('a registry path without the registry folder names no home', () => {
  expect(RootPathUtil.homeDirectoryOf('/srv/example/projects.json')).toBeNull();
});

test('a root under the home reads from ~', () => {
  expect(RootPathUtil.shortenedRootOf(`${HOME}/development/example-storefront`, HOME)).toBe('~/development/example-storefront');
  expect(RootPathUtil.shortenedRootOf(HOME, HOME)).toBe('~');
});

test('a root outside the home, or one only sharing its name as a prefix, is kept whole', () => {
  expect(RootPathUtil.shortenedRootOf('/srv/example-storefront', HOME)).toBe('/srv/example-storefront');
  expect(RootPathUtil.shortenedRootOf(`${HOME}-other/example`, HOME)).toBe(`${HOME}-other/example`);
});

test('with no home known the root is kept whole', () => {
  expect(RootPathUtil.shortenedRootOf(`${HOME}/development/example`, null)).toBe(`${HOME}/development/example`);
});
