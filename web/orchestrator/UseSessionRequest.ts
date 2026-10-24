import { useCallback, useState }           from 'react';
import type { OrchestratorRequestVerdict } from '../shell/OrchestratorRequestDelivery.ts';

export interface SessionRequest {
  isSending:      boolean;
  refusal:        string | null;
  /** True once the latest request was taken by the server, until the next one is sent. */
  wasTaken:       boolean;
  /** Sends one request at a time; resolves true when the server took it. */
  send:           (deliver: () => Promise<OrchestratorRequestVerdict>) => Promise<boolean>;
  dismissRefusal: () => void;
}

/** One control's request: busy while it is out, then the server's refusal text until the next attempt. */
export function useSessionRequest(): SessionRequest {
  const [isSending, setIsSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [wasTaken, setWasTaken] = useState(false);

  const send = useCallback(async (deliver: () => Promise<OrchestratorRequestVerdict>): Promise<boolean> => {
    setIsSending(true);
    setRefusal(null);
    setWasTaken(false);
    const verdict = await deliver();
    setIsSending(false);
    if (verdict.kind === 'refused') setRefusal(verdict.reason);
    setWasTaken(verdict.kind === 'sent');
    return verdict.kind === 'sent';
  }, []);

  const dismissRefusal = useCallback((): void => setRefusal(null), []);

  return {
    isSending, refusal, wasTaken, send, dismissRefusal
  };
}
