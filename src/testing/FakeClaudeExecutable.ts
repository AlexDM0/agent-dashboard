/**
 * A Bun script standing in for `claude -p` in stream-json, so no spec ever runs the real Claude Code: it records where
 * and how it was started and every stdin line in a transcript file, answers each user line with an `init` (the first
 * time), an `assistant` line carrying usage, a text and a tool call, and a `result`, or with an `AskUserQuestion` it
 * holds until a `control_response` answers it; it exits 0 once its stdin closes. A mode file turns its next replies
 * silent or into an exit. Test-only.
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

export const FAKE_CLAUDE_CODE_VERSION = '0.0.0-example';
export const FAKE_CLAUDE_MODEL = 'example-model';
export const FAKE_CONTEXT_WINDOW_TOKENS = 200_000;
/** input + cache read + cache creation tokens of every assistant line the fake prints. */
export const FAKE_USED_TOKENS = 1_234;
/** The fake's reply to a user line is this prefix and the line's text, then a `Bash` tool call. */
export const FAKE_REPLY_PREFIX = 'Example reply to: ';
/** A user line holding this asks `FAKE_QUESTION` through `AskUserQuestion`, as request `FAKE_QUESTION_REQUEST_ID`. */
export const FAKE_ASK_MARKER = 'ask-example-question';
export const FAKE_QUESTION_REQUEST_ID = 'example-question-request';
export const FAKE_QUESTION = {
  question:    'Which example colour should the board use for #135?',
  header:      'Colour',
  multiSelect: false,
  options:     [{ label: 'Red', description: 'An example red' }, { label: 'Blue', description: 'An example blue' }],
};
/** Once answered, the fake says this prefix and the answers as JSON. */
export const FAKE_ANSWERED_PREFIX = 'Example answers: ';

const EXECUTABLE_MODE = 0o755;

export type FakeClaudeTranscriptEntry =
  | { event: 'started'; directory: string; commandLineArguments: string[]; pid: number }
  | { event: 'stdin'; line: string }
  | { event: 'stdin-closed' }
  | { event: 'exited-unreplied' };

export function fakeClaudeTranscriptPathOf(directory: string): string {
  return join(directory, 'fake-claude-transcript.ndjson');
}

/**
 * How every running fake answers its next user line, read afresh for each: `reply` (the default), `silent` (the turn
 * never ends), or `exit` (the session exits without a reply).
 */
export type FakeClaudeMode = 'reply' | 'silent' | 'exit';

function fakeClaudeModePathOf(directory: string): string {
  return join(directory, 'fake-claude-mode');
}

export function setFakeClaudeMode(directory: string, mode: FakeClaudeMode): void {
  writeFileSync(fakeClaudeModePathOf(directory), mode);
}

export function writeFakeClaudeExecutable(directory: string): string {
  const transcriptPath = fakeClaudeTranscriptPathOf(directory);
  const scriptPath = join(directory, 'fake-claude.ts');
  const script = [
    '#!/usr/bin/env bun',
    'import { appendFileSync, existsSync, readFileSync } from "node:fs";',
    `const transcriptPath = ${JSON.stringify(transcriptPath)};`,
    `const modePath = ${JSON.stringify(fakeClaudeModePathOf(directory))};`,
    'const record = (entry) => appendFileSync(transcriptPath, JSON.stringify(entry) + "\\n");',
    'const print = (line) => process.stdout.write(JSON.stringify(line) + "\\n");',
    'record({ event: "started", directory: process.cwd(), commandLineArguments: process.argv.slice(2), pid: process.pid });',
    'let initPrinted = false;',
    `const usage = { input_tokens: 4, cache_read_input_tokens: ${FAKE_USED_TOKENS - 4 - 230}, cache_creation_input_tokens: 230, output_tokens: 7 };`,
    `const printAssistant = (content) => print({ type: "assistant", message: { model: ${JSON.stringify(FAKE_CLAUDE_MODEL)}, usage, content } });`,
    `const modelUsage = { ${JSON.stringify(FAKE_CLAUDE_MODEL)}: { contextWindow: ${FAKE_CONTEXT_WINDOW_TOKENS} } };`,
    'const printResult = () => print({ type: "result", subtype: "success", modelUsage });',
    `const questionInput = { questions: [${JSON.stringify(FAKE_QUESTION)}] };`,
    'const questionRequest = { subtype: "can_use_tool", tool_name: "AskUserQuestion", input: questionInput, requires_user_interaction: true };',
    'const bashCall = { type: "tool_use", id: "tool-bash", name: "Bash", input: { command: "agent-progress status --json" } };',
    'for await (const line of console) {',
    '  record({ event: "stdin", line });',
    '  let parsed = null;',
    '  try { parsed = JSON.parse(line); } catch {}',
    '  if (parsed?.type === "control_response") {',
    '    const answers = parsed.response?.response?.updatedInput?.answers ?? {};',
    `    printAssistant([{ type: "text", text: ${JSON.stringify(FAKE_ANSWERED_PREFIX)} + JSON.stringify(answers) }]);`,
    '    printResult();',
    '    continue;',
    '  }',
    '  if (parsed?.type !== "user") continue;',
    '  if (!initPrinted) {',
    '    initPrinted = true;',
    `    print({ type: "system", subtype: "init", claude_code_version: ${JSON.stringify(FAKE_CLAUDE_CODE_VERSION)}, permissionMode: "auto" });`,
    '  }',
    '  const mode = existsSync(modePath) ? readFileSync(modePath, "utf8").trim() : "reply";',
    '  if (mode === "exit") { record({ event: "exited-unreplied" }); process.exit(0); }',
    '  if (mode === "silent") continue;',
    '  const text = String(parsed.message?.content ?? "");',
    `  if (text.includes(${JSON.stringify(FAKE_ASK_MARKER)})) {`,
    '    printAssistant([{ type: "tool_use", id: "tool-ask", name: "AskUserQuestion", input: questionInput }]);',
    `    print({ type: "control_request", request_id: ${JSON.stringify(FAKE_QUESTION_REQUEST_ID)}, request: questionRequest });`,
    '    continue;',
    '  }',
    `  printAssistant([{ type: "text", text: ${JSON.stringify(FAKE_REPLY_PREFIX)} + text }, bashCall]);`,
    '  printResult();',
    '}',
    'record({ event: "stdin-closed" });',
    'process.exit(0);',
    '',
  ].join('\n');
  writeFileSync(scriptPath, script);
  chmodSync(scriptPath, EXECUTABLE_MODE);
  return scriptPath;
}

/** Every entry the fake recorded so far, in order; none before it started. */
export function readFakeClaudeTranscript(directory: string): FakeClaudeTranscriptEntry[] {
  let text: string;
  try {
    text = readFileSync(fakeClaudeTranscriptPathOf(directory), 'utf8');
  } catch {
    return [];
  }
  return text.split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line) as FakeClaudeTranscriptEntry);
}
