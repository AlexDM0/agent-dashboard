// Preloaded through BUN_OPTIONS into the CLI, the dashboard server and everything it spawns, so every "now" reads the story time:
// the instant written in STORY_CLOCK_FILE, plus the real time that has passed since that file was written.
import { readFileSync, statSync } from 'node:fs';

const storyClockFile = process.env['STORY_CLOCK_FILE'];
if (storyClockFile) {
  const OriginalDate = Date;
  const REREAD_AFTER_MILLISECONDS = 50;
  let storyMillisecondsAtWrite = 0;
  let realMillisecondsAtWrite = 0;
  let lastReadAtRealMilliseconds = -Infinity;

  const readStoryClock = () => {
    const writtenAt = statSync(storyClockFile).mtimeMs;
    const storyTime = readFileSync(storyClockFile, 'utf8').trim();
    const storyMilliseconds = OriginalDate.parse(storyTime);
    if (Number.isNaN(storyMilliseconds)) throw new Error(`${storyClockFile} holds no date: ${storyTime}`);
    storyMillisecondsAtWrite = storyMilliseconds;
    realMillisecondsAtWrite = writtenAt;
  };
  const currentStoryMilliseconds = () => {
    const realNow = OriginalDate.now();
    if (realNow - lastReadAtRealMilliseconds > REREAD_AFTER_MILLISECONDS) {
      readStoryClock();
      lastReadAtRealMilliseconds = realNow;
    }
    return storyMillisecondsAtWrite + Math.max(0, realNow - realMillisecondsAtWrite);
  };
  class StoryDate extends OriginalDate {
    constructor(...values) {
      if (values.length === 0) super(currentStoryMilliseconds());
      else super(...values);
    }

    static now() {
      return currentStoryMilliseconds();
    }
  }
  globalThis.Date = StoryDate;
}
