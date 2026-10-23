import { useId, useState }       from 'react';
import type { ProductOwnerMode } from '../../src/shared/DashboardContract.ts';
import { useSessionRequest }     from '../orchestrator/UseSessionRequest.ts';
import { startProductOwnerIn }   from './ChatOverlayRequests.ts';

interface ProductOwnerStartMenuProperties {
  trackerId:   string;
  projectName: string;
  onStarted:   () => void;
}

const START_CHOICES: { mode: ProductOwnerMode; label: string; description: string }[] = [
  { mode: 'file', label: 'File tickets', description: 'files what the user asks for' },
  { mode: 'spar', label: 'Spar first', description: 'files nothing until the user wraps up' },
];

/** "+ Product owner" and its two starts, filing tickets the default. */
export function ProductOwnerStartMenu({ trackerId, projectName, onStarted }: ProductOwnerStartMenuProperties) {
  const [isOpen, setIsOpen] = useState(false);
  const { isSending, refusal, send } = useSessionRequest();
  const choicesId = useId();

  async function start(mode: ProductOwnerMode): Promise<void> {
    const wasStarted = await send(() => startProductOwnerIn(trackerId, mode));
    if (!wasStarted) return;
    setIsOpen(false);
    onStarted();
  }

  return (
    <div className="ap-chat-start-product-owner">
      <button
        type="button"
        className="ap-control is-quiet ap-chat-add"
        aria-expanded={isOpen}
        aria-controls={choicesId}
        aria-label={`Start a product owner for ${projectName}`}
        onClick={() => setIsOpen((wasOpen) => !wasOpen)}
      >
        + Product owner
      </button>
      {isOpen
        ? (
          <div id={choicesId} className="ap-chat-start-choices" role="group" aria-label={`Product owner for ${projectName}`}>
            {START_CHOICES.map((choice) => (
              <button key={choice.mode} type="button" className="ap-control" disabled={isSending} title={choice.description} onClick={() => void start(choice.mode)}>
                {choice.label}
              </button>
            ))}
          </div>
        )
        : null}
      {isSending ? <span className="muted ap-caption" role="status">Starting…</span> : null}
      {refusal === null ? null : <span className="ap-stepper-refusal" role="alert">{refusal}</span>}
    </div>
  );
}
