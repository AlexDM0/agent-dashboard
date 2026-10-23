/**
 * Building the one answer a pending question takes: a single choice replaces, a multi-select toggles and joins its
 * labels in the order offered, "Other" counts only with text and typing into it chooses it, and the request is
 * withheld until every question has an answer, since the route refuses one that leaves a question out.
 */
import { expect, test }                           from 'bun:test';
import type { PendingQuestion, Question }         from '../../src/shared/DashboardContract.ts';
import { type QuestionDraft, QuestionAnswerUtil } from './QuestionAnswerUtil.ts';

const SINGLE_QUESTION: Question = {
  question:    'Which example colour?',
  header:      'Colour',
  multiSelect: false,
  options:     [{ label: 'Red', description: 'Example red' }, { label: 'Blue', description: 'Example blue' }],
};
const MULTI_QUESTION: Question = {
  question:    'Which example sizes?',
  header:      'Sizes',
  multiSelect: true,
  options:     [{ label: 'Small', description: '' }, { label: 'Medium', description: '' }, { label: 'Large', description: '' }],
};
const PENDING: PendingQuestion = {
  requestId: 'request-example',
  askedAt:   '2026-10-21T10:00:00+02:00',
  questions: [SINGLE_QUESTION, MULTI_QUESTION],
  context:   { dispatcherRunId: null, mentionedTicketIds: [], lastAssistantLine: null },
};
const EMPTY: QuestionDraft = { chosenLabels: [], isOtherChosen: false, otherText: '' };

test('a single-select choice replaces the one before, "Other" included', () => {
  const red = QuestionAnswerUtil.withChoice(EMPTY, { kind: 'label', label: 'Red' }, false);
  const other = QuestionAnswerUtil.withChoice(red, { kind: 'other' }, false);
  const blue = QuestionAnswerUtil.withChoice(other, { kind: 'label', label: 'Blue' }, false);
  expect(red.chosenLabels).toEqual(['Red']);
  expect(other).toEqual({ chosenLabels: [], isOtherChosen: true, otherText: '' });
  expect(blue).toEqual({ chosenLabels: ['Blue'], isOtherChosen: false, otherText: '' });
});

test('a multi-select toggles and answers its labels in the order offered, joined', () => {
  let draft = QuestionAnswerUtil.withChoice(EMPTY, { kind: 'label', label: 'Large' }, true);
  draft = QuestionAnswerUtil.withChoice(draft, { kind: 'label', label: 'Small' }, true);
  draft = QuestionAnswerUtil.withChoice(draft, { kind: 'label', label: 'Medium' }, true);
  draft = QuestionAnswerUtil.withChoice(draft, { kind: 'label', label: 'Medium' }, true);
  expect(QuestionAnswerUtil.answerOf(MULTI_QUESTION, draft)).toBe('Small, Large');
});

test('"Other" answers its trimmed text, last in a multi-select, and nothing without text', () => {
  const chosenOther = QuestionAnswerUtil.withChoice(EMPTY, { kind: 'other' }, false);
  expect(QuestionAnswerUtil.answerOf(SINGLE_QUESTION, chosenOther)).toBeNull();
  expect(QuestionAnswerUtil.answerOf(SINGLE_QUESTION, QuestionAnswerUtil.withOtherText(chosenOther, '  Green  ', false))).toBe('Green');
  const small = QuestionAnswerUtil.withChoice(EMPTY, { kind: 'label', label: 'Small' }, true);
  expect(QuestionAnswerUtil.answerOf(MULTI_QUESTION, QuestionAnswerUtil.withOtherText(small, 'Huge', true))).toBe('Small, Huge');
});

test('typing into "Other" chooses it, dropping a single-select label', () => {
  const red = QuestionAnswerUtil.withChoice(EMPTY, { kind: 'label', label: 'Red' }, false);
  expect(QuestionAnswerUtil.withOtherText(red, 'G', false)).toEqual({ chosenLabels: [], isOtherChosen: true, otherText: 'G' });
  expect(QuestionAnswerUtil.withOtherText(EMPTY, 'G', true).isOtherChosen).toBe(true);
});

test('text left in an unchosen multi-select "Other" is not sent', () => {
  const typed = QuestionAnswerUtil.withOtherText(EMPTY, 'Huge', true);
  const unchosen = QuestionAnswerUtil.withChoice(typed, { kind: 'other' }, true);
  const small = QuestionAnswerUtil.withChoice(unchosen, { kind: 'label', label: 'Small' }, true);
  expect(QuestionAnswerUtil.answerOf(MULTI_QUESTION, small)).toBe('Small');
});

test('the request is withheld until every question has an answer, then keyed by question text', () => {
  const drafts = QuestionAnswerUtil.emptyDraftsOf(PENDING);
  expect(drafts).toHaveLength(2);
  expect(QuestionAnswerUtil.answerRequestOf(PENDING, drafts)).toBeNull();
  const firstAnswered = [QuestionAnswerUtil.withChoice(EMPTY, { kind: 'label', label: 'Blue' }, false), EMPTY];
  expect(QuestionAnswerUtil.answerRequestOf(PENDING, firstAnswered)).toBeNull();
  const bothAnswered = [firstAnswered[0] ?? EMPTY, QuestionAnswerUtil.withChoice(EMPTY, { kind: 'label', label: 'Medium' }, true)];
  expect(QuestionAnswerUtil.answerRequestOf(PENDING, bothAnswered)).toEqual({
    requestId: 'request-example',
    answers:   { 'Which example colour?': 'Blue', 'Which example sizes?': 'Medium' },
  });
});
