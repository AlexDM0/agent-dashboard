import { useId }                                                     from 'react';
import type { OrchestratorAnswerRequest, PendingQuestion, Question } from '../../src/shared/DashboardContract.ts';
import { useSessionRequest }                                         from '../orchestrator/UseSessionRequest.ts';
import { type QuestionDraft, QuestionAnswerUtil }                    from '../questions/QuestionAnswerUtil.ts';
import { TimeUtil }                                                  from '../time/TimeUtil.ts';
import type { ChatConversation }                                     from './ChatConversationListUtil.ts';
import { answerConversation }                                        from './ChatOverlayRequests.ts';

interface DockedQuestionCardProperties {
  conversation:    ChatConversation;
  pendingQuestion: PendingQuestion;
  /** The requests still waiting behind this one. */
  laterCount:      number;
  drafts:          QuestionDraft[];
  now:             number;
  onDraftsChange:  (drafts: QuestionDraft[]) => void;
  onAnswered:      (requestId: string) => void;
}

interface QuestionChoicesProperties {
  question:      Question;
  draft:         QuestionDraft;
  isDisabled:    boolean;
  onDraftChange: (draft: QuestionDraft) => void;
}

/** A multi-select as checkboxes, a single-select as pressed buttons; free text comes from the composer as "Other". */
function QuestionChoices({
  question, draft, isDisabled, onDraftChange
}: QuestionChoicesProperties) {
  const groupName = useId();
  return (
    <fieldset className="ap-chat-question" disabled={isDisabled}>
      <legend className="ap-question-text">
        {question.header === '' ? null : <span className="ap-queue-label ap-question-header">{question.header}</span>}
        {question.question}
      </legend>
      <div className="ap-chat-question-options">
        {question.options.map((option) => {
          const isChosen = draft.chosenLabels.includes(option.label);
          const choose = (): void => onDraftChange(QuestionAnswerUtil.withChoice(draft, { kind: 'label', label: option.label }, question.multiSelect));
          return question.multiSelect
            ? (
              <label key={option.label} className="ap-question-option" title={option.description}>
                <input type="checkbox" name={groupName} checked={isChosen} onChange={choose} />
                <span className="ap-question-label">{option.label}</span>
              </label>
            )
            : (
              <button key={option.label} type="button" className="ap-control ap-chat-option" aria-pressed={isChosen} title={option.description} onClick={choose}>
                {option.label}
              </button>
            );
        })}
      </div>
    </fieldset>
  );
}

/** Docked between the conversation and the composer while the session waits; it leaves when a snapshot no longer holds the request. */
export function DockedQuestionCard({
  conversation, pendingQuestion, laterCount, drafts, now, onDraftsChange, onAnswered
}: DockedQuestionCardProperties) {
  const { isSending, refusal, send } = useSessionRequest();
  const age = TimeUtil.agoPhraseOfStamp(pendingQuestion.askedAt, now);
  const [onlyQuestion] = pendingQuestion.questions;

  async function answer(answerRequest: OrchestratorAnswerRequest | null): Promise<void> {
    if (answerRequest === null || isSending) return;
    const wasSent = await send(() => answerConversation(conversation, answerRequest));
    if (wasSent) onAnswered(answerRequest.requestId);
  }

  const answerRequest = QuestionAnswerUtil.answerRequestOf(pendingQuestion, drafts);
  return (
    <section className="ap-chat-waiting-card" aria-label="Waiting for your answer">
      <header className="ap-chat-waiting-head">
        <span className="ap-pill" data-state="in-review">Waiting for your answer</span>
        {age === '' ? null : <span className="muted ap-caption">asked {age}</span>}
        {laterCount === 0 ? null : <span className="muted ap-caption">· {laterCount} more after this</span>}
      </header>
      {QuestionAnswerUtil.isOneClick(pendingQuestion) && onlyQuestion !== undefined
        ? (
          <div className="ap-chat-question">
            <p className="ap-question-text">
              {onlyQuestion.header === '' ? null : <span className="ap-queue-label ap-question-header">{onlyQuestion.header}</span>}
              {onlyQuestion.question}
            </p>
            <div className="ap-chat-question-options" role="group" aria-label={`Answers to: ${onlyQuestion.question}`}>
              {onlyQuestion.options.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className="ap-control ap-chat-option"
                  disabled={isSending}
                  title={option.description}
                  onClick={() => void answer(QuestionAnswerUtil.oneClickAnswerRequestOf(pendingQuestion, option.label))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )
        : (
          <>
            {pendingQuestion.questions.map((question, index) => (
              <QuestionChoices
                key={question.question}
                question={question}
                draft={drafts[index] ?? { chosenLabels: [], isOtherChosen: false, otherText: '' }}
                isDisabled={isSending}
                onDraftChange={(draft) => onDraftsChange(drafts.map((candidate, candidateIndex) => (candidateIndex === index ? draft : candidate)))}
              />
            ))}
            <div className="ap-question-actions">
              <button type="button" className="ap-control" disabled={isSending || answerRequest === null} onClick={() => void answer(answerRequest)}>
                {isSending ? 'Sending…' : 'Answer'}
              </button>
            </div>
          </>
        )}
      {isSending ? <span className="muted ap-caption" role="status">Sending…</span> : null}
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </section>
  );
}
