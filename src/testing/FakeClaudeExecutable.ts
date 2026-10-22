/**
 * A Bun script standing in for `claude -p` in stream-json, so no spec ever runs the real Claude Code: it records where
 * and how it was started and every stdin line in a transcript file, answers each user line with an `init` (the first
 * time), an `assistant` line carrying usage and a `result`, and exits 0 once its stdin closes. Test-only.
 */
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';

export const FAKE_CLAUDE_CODE_VERSION = '0.0.0-example';
export const FAKE_CLAUDE_MODEL = 'example-model';
export const FAKE_CONTEXT_WINDOW_TOKENS = 200_000;
/** input + cache read + cache creation tokens of every assistant line the fake prints. */
export const FAKE_USED_TOKENS = 1_234;

const EXECUTABLE_MODE = 0o755;

export type FakeClaudeTranscriptEntry =
  | { event: 'started'; directory: string; commandLineArguments: string[]; pid: number }
  | { event: 'stdin'; line: string }
  | { event: 'stdin-closed' };

export function fakeClaudeTranscriptPathOf(directory: string): string {
  return join(directory, 'fake-claude-transcript.ndjson');
}

export function writeFakeClaudeExecutable(directory: string): string {
  const transcriptPath = fakeClaudeTranscriptPathOf(directory);
  const scriptPath = join(directory, 'fake-claude.ts');
  const script = [
    '#!/usr/bin/env bun',
    'import { appendFileSync } from "node:fs";',
    `const transcriptPath = ${JSON.stringify(transcriptPath)};`,
    'const record = (entry) => appendFileSync(transcriptPath, JSON.stringify(entry) + "\\n");',
    'const print = (line) => process.stdout.write(JSON.stringify(line) + "\\n");',
    'record({ event: "started", directory: process.cwd(), commandLineArguments: process.argv.slice(2), pid: process.pid });',
    'let initPrinted = false;',
    'for await (const line of console) {',
    '  record({ event: "stdin", line });',
    '  let parsed = null;',
    '  try { parsed = JSON.parse(line); } catch {}',
    '  if (parsed?.type !== "user") continue;',
    '  if (!initPrinted) {',
    '    initPrinted = true;',
    `    print({ type: "system", subtype: "init", claude_code_version: ${JSON.stringify(FAKE_CLAUDE_CODE_VERSION)}, permissionMode: "auto" });`,
    '  }',
    `  const usage = { input_tokens: 4, cache_read_input_tokens: ${FAKE_USED_TOKENS - 4 - 230}, cache_creation_input_tokens: 230, output_tokens: 7 };`,
    `  print({ type: "assistant", message: { model: ${JSON.stringify(FAKE_CLAUDE_MODEL)}, usage } });`,
    `  print({ type: "result", subtype: "success", modelUsage: { ${JSON.stringify(FAKE_CLAUDE_MODEL)}: { contextWindow: ${FAKE_CONTEXT_WINDOW_TOKENS} } } });`,
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
