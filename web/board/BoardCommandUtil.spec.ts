/**
 * Which dispatcher actions the command bar shows: Start building only while the dispatcher does not run, Stop only
 * while it does, and the low-priority control only with tickets waiting, worded for before or during a run.
 */
import { expect, test }     from 'bun:test';
import { BoardCommandUtil } from './BoardCommandUtil.ts';

test('a running board with low-priority tickets waiting offers Pick up low-priority and Stop, not Start building', () => {
  expect(BoardCommandUtil.commandsOf('running', 3)).toEqual(['pick-up-low-priority', 'stop-dispatcher']);
});

test('a running board with none waiting offers Stop alone', () => {
  expect(BoardCommandUtil.commandsOf('running', 0)).toEqual(['stop-dispatcher']);
});

test('a finished or stopped board offers Start building and never Stop', () => {
  expect(BoardCommandUtil.commandsOf('finished', 0)).toEqual(['start-building']);
  expect(BoardCommandUtil.commandsOf('stopped', 0)).toEqual(['start-building']);
});

test('a finished board with low-priority tickets waiting offers to include them beside Start building', () => {
  expect(BoardCommandUtil.commandsOf('finished', 2)).toEqual(['start-building', 'include-low-priority']);
});

test('the low-priority control is worded for the dispatcher state and carries the waiting count', () => {
  expect(BoardCommandUtil.lowPriorityLabelOf('running', 3)).toBe('Pick up low-priority 3');
  expect(BoardCommandUtil.lowPriorityLabelOf('stopped', 1)).toBe('Include low-priority 1');
});
