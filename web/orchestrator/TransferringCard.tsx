import type { SessionRole }        from '../../src/shared/DashboardContract.ts';
import { OrchestratorSessionUtil } from './OrchestratorSessionUtil.ts';
import { SessionGlyph }            from './SessionGlyph.tsx';
import type { SessionTransfer }    from './SessionTransferUtil.ts';

interface TransferringCardProperties {
  role:      SessionRole;
  transfer:  SessionTransfer;
  onDismiss: () => void;
}

const DIAL_DOT_KEYS = ['dot-1', 'dot-2', 'dot-3', 'dot-4', 'dot-5'];

const PHASE_PILLS: Record<SessionTransfer['phase'], { text: string; state: string }> = {
  transferring: { text: 'moving', state: 'reviewing' },
  opened:       { text: 'opened', state: 'reviewed' },
  failed:       { text: 'not opened', state: 'abandoned' },
};

function TransferStatus({ transfer, onDismiss }: { transfer: SessionTransfer; onDismiss: () => void }) {
  if (transfer.phase === 'transferring') return <p className="muted ap-transfer-status" role="status">Moving to the Claude app…</p>;
  if (transfer.phase === 'opened') return <p className="ap-transfer-status" role="status">The session lives in the Claude app now.</p>;
  return (
    <div className="ap-transfer-status">
      <span className="ap-stepper-refusal" role="alert">{transfer.refusal}</span>
      <button type="button" className="ap-control is-quiet" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

/** A session card while it moves into the Claude app: the dialling handshake, its opened beat, or its refusal until dismissed. */
export function TransferringCard({ role, transfer, onDismiss }: TransferringCardProperties) {
  const sessionName = OrchestratorSessionUtil.nameOf(transfer.session, role);
  const pill = PHASE_PILLS[transfer.phase];
  return (
    <section className="ap-session ap-transfer" data-phase={transfer.phase} aria-label={sessionName}>
      <header className="ap-session-head">
        <span className="ap-session-name ellipsis" title={sessionName}>{sessionName}</span>
        <span className="ap-pill" data-state={pill.state}>{pill.text}</span>
      </header>
      <div className="ap-transfer-stage" aria-hidden="true">
        <SessionGlyph role={role} session={transfer.session} />
        <span className="ap-transfer-line">
          <span className="ap-transfer-dots">{DIAL_DOT_KEYS.map((dotKey) => <span key={dotKey} />)}</span>
          {transfer.phase === 'failed' ? <span className="ap-transfer-severed">×</span> : null}
        </span>
        <span className="ap-transfer-app" title="Claude app">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.5 3.5M14.9 14.9l3.5 3.5M18.4 5.6l-3.5 3.5M9.1 14.9l-3.5 3.5" />
          </svg>
          <span className="ap-transfer-check">
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.3 5 8.6 9.6 3.6" /></svg>
          </span>
        </span>
      </div>
      <TransferStatus transfer={transfer} onDismiss={onDismiss} />
    </section>
  );
}
