/**
 * The brief is the product owner's whole instruction, so each mode's text must name the skill and the prohibitions, and
 * only `spar` may carry the wrap-up rule; the start body is exactly `{ "mode": ... }` with a known mode, anything else
 * refused rather than guessed.
 */
import { expect, test } from 'bun:test';

import { PRODUCT_OWNER_WRAP_UP_TEXT, productOwnerBriefTextOf, productOwnerModeOf } from './ProductOwnerBriefMessage.ts';

test('a body naming spar or file is that mode, and any other body is null', () => {
  expect(productOwnerModeOf('{"mode":"spar"}')).toBe('spar');
  expect(productOwnerModeOf('{"mode":"file"}')).toBe('file');
  expect(productOwnerModeOf('{"mode":"later"}')).toBeNull();
  expect(productOwnerModeOf('{"mode":"spar","startBuilding":true}')).toBeNull();
  expect(productOwnerModeOf('["spar"]')).toBeNull();
  expect(productOwnerModeOf('not json')).toBeNull();
});

test('both briefs open with the /agent-po command and name the project and the prohibitions; only the spar brief has the wrap-up rule', () => {
  const sparBrief = productOwnerBriefTextOf('example-storefront', 'spar');
  const fileBrief = productOwnerBriefTextOf('example-storefront', 'file');
  for (const brief of [sparBrief, fileBrief]) {
    expect(brief.startsWith('/agent-po\n')).toBe(true);
    expect(brief).not.toContain('Load the `agent-po`');
    for (const named of ['example-storefront', 'Never load the `agent-progress-orchestrate` skill', 'never dispatch', 'never claim or start a ticket']) {
      expect(brief).toContain(named);
    }
  }
  expect(sparBrief).toContain(`file nothing until the user says "${PRODUCT_OWNER_WRAP_UP_TEXT}"`);
  expect(fileBrief).not.toContain(PRODUCT_OWNER_WRAP_UP_TEXT);
});
