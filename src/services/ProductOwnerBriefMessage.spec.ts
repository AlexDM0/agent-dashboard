/**
 * The brief is the product owner's whole instruction, so each mode's text must name the skill and the prohibitions, and
 * only `spar` may carry the wrap-up rule and #043's `spar-table` paragraph, whose exact words the web's reader relies on;
 * the start body is exactly `{ "mode": ... }` with a known mode and an optional topic of 1 to 120 characters trimmed,
 * anything else refused rather than guessed. A topic names the question a sparring product owner researches or the
 * feature a filing one files for, so several product owners of one project each know their own.
 */
import { expect, test } from 'bun:test';

import {
  PRODUCT_OWNER_WRAP_UP_TEXT,
  SPAR_TABLE_INSTRUCTION,
  productOwnerBriefTextOf,
  productOwnerStartOf,
} from './ProductOwnerBriefMessage.ts';

const LONGEST_TOPIC_CHARACTERS = 120;

test('a body naming spar or file is that mode, and any other body is null', () => {
  expect(productOwnerStartOf('{"mode":"spar"}')).toEqual({ mode: 'spar', topic: null });
  expect(productOwnerStartOf('{"mode":"file"}')).toEqual({ mode: 'file', topic: null });
  expect(productOwnerStartOf('{"mode":"later"}')).toBeNull();
  expect(productOwnerStartOf('{"mode":"spar","startBuilding":true}')).toBeNull();
  expect(productOwnerStartOf('["spar"]')).toBeNull();
  expect(productOwnerStartOf('not json')).toBeNull();
});

test('a topic is taken trimmed from 1 to 120 characters, and an empty, overlong or non-text topic refuses the body', () => {
  expect(productOwnerStartOf('{"mode":"spar","topic":"  Stepper overflow  "}')).toEqual({ mode: 'spar', topic: 'Stepper overflow' });
  const longestTopic = 'x'.repeat(LONGEST_TOPIC_CHARACTERS);
  expect(productOwnerStartOf(JSON.stringify({ mode: 'file', topic: longestTopic }))).toEqual({ mode: 'file', topic: longestTopic });
  expect(productOwnerStartOf(JSON.stringify({ mode: 'file', topic: `${longestTopic}x` }))).toBeNull();
  expect(productOwnerStartOf('{"mode":"spar","topic":"   "}')).toBeNull();
  expect(productOwnerStartOf('{"mode":"spar","topic":7}')).toBeNull();
  expect(productOwnerStartOf('{"mode":"spar","topic":"Example","extra":1}')).toBeNull();
});

test('a spar brief names its topic as the question researched, a file brief as the feature filed for, and a brief without one names none', () => {
  const sparBrief = productOwnerBriefTextOf('example-storefront', 'spar', 'Stepper overflow');
  expect(sparBrief).toContain('Your topic is the question you research with the user: "Stepper overflow". Other product owners may run beside you on other topics.');
  expect(sparBrief).toContain('This is a sparring session');
  const fileBrief = productOwnerBriefTextOf('example-storefront', 'file', 'Roles stage');
  expect(fileBrief).toContain('Your topic is the feature you file tickets for: "Roles stage". Other product owners may run beside you on other topics.');
  expect(fileBrief).toContain('This is a filing session');
  const briefWithoutTopic = productOwnerBriefTextOf('example-storefront', 'spar');
  expect(briefWithoutTopic).not.toContain('Your topic');
  expect(briefWithoutTopic).toBe(productOwnerBriefTextOf('example-storefront', 'spar', null));
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

const EVIDENCE_SPAR_TABLE_PARAGRAPH = 'The dashboard shows a panel called "On the table" beside this chat. You keep it '
  + 'current. Whenever the table changes in a reply (a point raised, agreed, reopened or parked; a ticket you would file '
  + 'at wrap-up added, changed or dropped; a ticket id mentioned), end that reply with exactly one fenced block whose '
  + 'info string is spar-table, holding the whole table as one JSON object, nothing else in the block:\n'
  + '\n'
  + '```spar-table\n'
  + '{"points":[{"id":"p1","text":"...","state":"open"}],"draftTickets":[{"key":"d1","title":"...","type":"ticket",'
  + '"summary":"..."}],"referencedTicketIds":["042"]}\n'
  + '```\n'
  + '\n'
  + '- points: every point of the conversation so far, each with a short id you keep stable (p1, p2, ...), one '
  + 'sentence of text, and state "agreed", "open" or "parked".\n'
  + '- draftTickets: every ticket you would file at wrap-up, each with a stable key (d1, d2, ...), its title, type '
  + '"ticket", "bug" or "research", and a one-sentence summary.\n'
  + '- referencedTicketIds: the three-digit ids of existing tickets the conversation has named, as strings.\n'
  + 'Always send the whole table, never a change to it; the newest block replaces the last. Leave the block out of a '
  + 'reply that changes nothing. The table is display only: filing still happens through agent-po at wrap-up.';

test('only the spar brief carries #043\'s spar-table paragraph, verbatim from its evidence', () => {
  expect(SPAR_TABLE_INSTRUCTION).toBe(EVIDENCE_SPAR_TABLE_PARAGRAPH);
  expect(productOwnerBriefTextOf('example-storefront', 'spar')).toContain(EVIDENCE_SPAR_TABLE_PARAGRAPH);
  expect(productOwnerBriefTextOf('example-storefront', 'file')).not.toContain('spar-table');
});
