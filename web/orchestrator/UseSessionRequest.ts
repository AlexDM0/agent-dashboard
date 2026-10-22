import { useCallback, useState }           from 'react';
import type { OrchestratorRequestVerdict } from '../shell/OrchestratorRequestDelivery.ts';

export interface SessionRequest {
  isSending: boolean;
  refusal:   string | null;
  /** Sends one request at a time; resolves true when the server took it. */
  send:      (deliver: () => Promise<OrchestratorRequestVerdict>) => Promise<boolean>;
}

/** One control's request: busy while it is out, then the server's refusal text until the next attempt. */
export function useSessionRequest(): SessionRequest {
  const [isSending, setIsSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const send = useCallback(async (deliver: () => Promise<OrchestratorRequestVerdict>): Promise<boolean> => {
    setIsSending(true);
    setRefusal(null);
    const verdict = await deliver();
    setIsSending(false);
    if (verdict.kind === 'refused') setRefusal(verdict.reason);
    return verdict.kind === 'sent';
  }, []);

  return { isSending, refusal, send };
}
