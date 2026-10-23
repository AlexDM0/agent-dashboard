import { type FormEvent, useId, useState }             from 'react';
import type { PendingQuestion, Question, SessionRole } from '../../src/shared/DashboardContract.ts';
import { sendSessionAnswer }                           from '../orchestrator/OrchestratorSessionDelivery.ts';
import { useSessionRequest }                           from '../orchestrator/UseSessionRequest.ts';
import { type QuestionDraft, QuestionAnswerUtil }      from './QuestionAnswerUtil.ts';

interface PendingQuestionFormProperties {
  role:            SessionRole;
  trackerId:       string;
  pendingQuestion: PendingQuestion;
}

const FORM_LABELS: Record<SessionRole, string> = { 'orchestrator': 'Question from the orchestrator', 'product-owner': 'Question from the product owner' };

interface QuestionFieldProperties {
  question:      Question;
  draft:         QuestionDraft;
  groupName:     string;
  isDisabled:    boolean;
  onDraftChange: (draft: QuestionDraft) => void;
}

function QuestionField({
  question, draft, groupName, isDisabled, onDraftChange
}: QuestionFieldProperties) {
  const inputType = question.multiSelect ? 'checkbox' : 'radio';
  return (
    <fieldset className="ap-question" disabled={isDisabled}>
      <legend className="ap-question-text">
        {question.header === '' ? null : <span className="ap-queue-label ap-question-header">{question.header}</span>}
        {question.question}
      </legend>
      {question.options.map((option) => (
        <label key={option.label} className="ap-question-option">
          <input
            type={inputType}
            name={groupName}
            checked={draft.chosenLabels.includes(option.label)}
            onChange={() => onDraftChange(QuestionAnswerUtil.withChoice(draft, { kind: 'label', label: option.label }, question.multiSelect))}
          />
          <span>
            <span className="ap-question-label">{option.label}</span>
            {option.description === '' ? null : <span className="muted ap-question-description">{option.description}</span>}
          </span>
        </label>
      ))}
      <div className="ap-question-option">
        <input
          type={inputType}
          name={groupName}
          aria-label="Other"
          checked={draft.isOtherChosen}
          onChange={() => onDraftChange(QuestionAnswerUtil.withChoice(draft, { kind: 'other' }, question.multiSelect))}
        />
        <input
          type="text"
          className="ap-question-other"
          placeholder="Other"
          aria-label={`Other answer to: ${question.question}`}
          value={draft.otherText}
          onChange={(event) => onDraftChange(QuestionAnswerUtil.withOtherText(draft, event.target.value, question.multiSelect))}
        />
      </div>
    </fieldset>
  );
}

/** Answered once for every question together; the card leaves when a snapshot no longer holds the request. */
export function PendingQuestionForm({ role, trackerId, pendingQuestion }: PendingQuestionFormProperties) {
  const [drafts, setDrafts] = useState(() => QuestionAnswerUtil.emptyDraftsOf(pendingQuestion));
  const [wasAnswered, setWasAnswered] = useState(false);
  const { isSending, refusal, send } = useSessionRequest();
  const groupNamePrefix = useId();
  const answerRequest = QuestionAnswerUtil.answerRequestOf(pendingQuestion, drafts);
  const isDisabled = isSending || wasAnswered;

  async function submitAnswer(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (answerRequest === null || isDisabled) return;
    const wasSent = await send(() => sendSessionAnswer(role, trackerId, answerRequest));
    if (wasSent) setWasAnswered(true);
  }

  return (
    <form className="ap-question-card" aria-label={FORM_LABELS[role]} onSubmit={(event) => void submitAnswer(event)}>
      {pendingQuestion.questions.map((question, index) => (
        <QuestionField
          key={question.question}
          question={question}
          draft={drafts[index] ?? { chosenLabels: [], isOtherChosen: false, otherText: '' }}
          groupName={`${groupNamePrefix}-${String(index)}`}
          isDisabled={isDisabled}
          onDraftChange={(draft) => setDrafts((previous) => previous.map((candidate, candidateIndex) => (candidateIndex === index ? draft : candidate)))}
        />
      ))}
      <div className="ap-question-actions">
        <button type="submit" className="ap-control" disabled={isDisabled || answerRequest === null}>
          {isSending ? 'Sending…' : wasAnswered ? 'Answered' : 'Answer'}
        </button>
        {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
      </div>
    </form>
  );
}
