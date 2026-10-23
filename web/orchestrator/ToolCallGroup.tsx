import { WEB_LIMITS }                               from '../constants/WebLimits.ts';
import { ConversationItemUtil, type ShownToolCall } from './ConversationItemUtil.ts';

function ToolCallRow({ call }: { call: ShownToolCall }) {
  const firstLine = call.inputSummary.split('\n', 1)[0] ?? '';
  const isSummaryCut = firstLine.length > WEB_LIMITS.TOOL_CALL_SUMMARY_CHARACTERS || firstLine.length < call.inputSummary.length;
  const summary = firstLine.length > WEB_LIMITS.TOOL_CALL_SUMMARY_CHARACTERS ? `${firstLine.slice(0, WEB_LIMITS.TOOL_CALL_SUMMARY_CHARACTERS)}…` : firstLine;
  return (
    <li className="ap-tool-call" data-progress={call.progress}>
      <details>
        <summary className="mono ap-tool-summary">
          <span className="ap-tool-name">{call.toolName}</span> {summary}
        </summary>
        {isSummaryCut && <pre className="mono ap-tool-text">{call.inputSummary}</pre>}
        {call.progress === 'running' && <p className="muted ap-tool-status">Running…</p>}
        {call.progress === 'unrecorded' && <p className="muted ap-tool-status">No result recorded</p>}
        {call.progress === 'answered' && <pre className="mono ap-tool-text ap-tool-result">{call.result.length === 0 ? '(no output)' : call.result}</pre>}
      </details>
    </li>
  );
}

/** A run of tool calls between two text turns, closed to one line; each call opens to its result. */
export function ToolCallGroup({ calls }: { calls: ShownToolCall[] }) {
  return (
    <li className="ap-turn" data-role="tool">
      <details className="ap-tool-group">
        <summary className="ap-tool-group-summary">{ConversationItemUtil.groupLabelOf(calls.length)}</summary>
        <ol className="ap-tool-calls">
          {calls.map((call, index) => <ToolCallRow key={call.callId ?? index} call={call} />)}
        </ol>
      </details>
    </li>
  );
}
