import type { OrchestratorAnswerRequest, PendingQuestion, Question } from '../../src/shared/DashboardContract.ts';

/** What the user has chosen so far for one question: offered labels, and whether the free-text "Other" is among them. */
export interface QuestionDraft {
  chosenLabels:  string[];
  isOtherChosen: boolean;
  otherText:     string;
}

export type QuestionChoice = { kind: 'label'; label: string } | { kind: 'other' };

/** Claude Code's own `AskUserQuestion` answer joins a multi-select's labels this way. */
export const MULTI_SELECT_SEPARATOR = ', ';

function emptyDraftsOf(pendingQuestion: PendingQuestion): QuestionDraft[] {
  return pendingQuestion.questions.map(() => ({ chosenLabels: [], isOtherChosen: false, otherText: '' }));
}

/** A single-select choice replaces the previous one; a multi-select choice toggles. */
function withChoice(draft: QuestionDraft, choice: QuestionChoice, isMultiSelect: boolean): QuestionDraft {
  if (!isMultiSelect) {
    return choice.kind === 'other'
      ? { ...draft, chosenLabels: [], isOtherChosen: true }
      : { ...draft, chosenLabels: [choice.label], isOtherChosen: false };
  }
  if (choice.kind === 'other') return { ...draft, isOtherChosen: !draft.isOtherChosen };
  const chosenLabels = draft.chosenLabels.includes(choice.label)
    ? draft.chosenLabels.filter((label) => label !== choice.label)
    : [...draft.chosenLabels, choice.label];
  return { ...draft, chosenLabels };
}

/** Typing into "Other" chooses it, so a keyboard user never has to select it first. */
function withOtherText(draft: QuestionDraft, otherText: string, isMultiSelect: boolean): QuestionDraft {
  return isMultiSelect
    ? { ...draft, otherText, isOtherChosen: otherText.trim() !== '' || draft.isOtherChosen }
    : { chosenLabels: [], isOtherChosen: true, otherText };
}

/** The answer text for one question, its labels in the order offered and "Other" last; null while it has none. */
function answerOf(question: Question, draft: QuestionDraft): string | null {
  const offeredInOrder = question.options.map((option) => option.label).filter((label) => draft.chosenLabels.includes(label));
  const otherText = draft.otherText.trim();
  const parts = draft.isOtherChosen && otherText !== '' ? [...offeredInOrder, otherText] : offeredInOrder;
  return parts.length === 0 ? null : parts.join(MULTI_SELECT_SEPARATOR);
}

/** The one answer the route takes for the whole request, or null while any question is still unanswered. */
function answerRequestOf(pendingQuestion: PendingQuestion, drafts: QuestionDraft[]): OrchestratorAnswerRequest | null {
  const answers: Record<string, string> = {};
  for (const [index, question] of pendingQuestion.questions.entries()) {
    const draft = drafts[index];
    const answer = draft === undefined ? null : answerOf(question, draft);
    if (answer === null) return null;
    answers[question.question] = answer;
  }
  return { requestId: pendingQuestion.requestId, answers };
}

export const QuestionAnswerUtil = Object.freeze({
  emptyDraftsOf, withChoice, withOtherText, answerOf, answerRequestOf
});
