/**
 * The bare call must mean `open` on the default port, since that is what a person types every day; every malformed option
 * must be a refusal naming it rather than a guess, because a guessed port or command starts or stops the wrong server.
 */
import { describe, expect, test } from 'bun:test';

import { DASHBOARD_LIMITS }    from '../src/shared/constants/DashboardLimits.ts';
import { parsedCommandLineOf } from './ParsedCommandLine.ts';

const EXAMPLE_PORT = 4811;

describe('commands', () => {
  test('no arguments opens the dashboard on the default port with the browser', () => {
    expect(parsedCommandLineOf([])).toEqual({ kind: 'command', command: 'open', options: { port: DASHBOARD_LIMITS.DEFAULT_PORT, portIsGiven: false, browserOpens: true } });
  });

  test('options alone belong to open', () => {
    expect(parsedCommandLineOf(['--no-open', '--port', String(EXAMPLE_PORT)]))
      .toEqual({ kind: 'command', command: 'open', options: { port: EXAMPLE_PORT, portIsGiven: true, browserOpens: false } });
  });

  test('serve takes --port in both spellings', () => {
    expect(parsedCommandLineOf(['serve', `--port=${EXAMPLE_PORT}`]))
      .toEqual({ kind: 'command', command: 'serve', options: { port: EXAMPLE_PORT, portIsGiven: true, browserOpens: true } });
  });

  test('supervise takes a tracker id, a root and a known role, and refuses a missing or unknown role', () => {
    expect(parsedCommandLineOf(['supervise', 'example-tracker', '/example/root', 'product-owner']))
      .toEqual({
        kind: 'supervise', trackerId: 'example-tracker', root: '/example/root', role: 'product-owner', productOwnerMode: null
      });
    expect(parsedCommandLineOf(['supervise', 'example-tracker', '/example/root']).kind).toBe('refused');
    expect(parsedCommandLineOf(['supervise', 'example-tracker', '/example/root', 'example-role']).kind).toBe('refused');
  });

  test('supervise takes a product owner\'s mode after its role, and refuses a mode for an orchestrator or an unknown mode', () => {
    expect(parsedCommandLineOf(['supervise', 'example-tracker', '/example/root', 'product-owner', 'spar']))
      .toMatchObject({ kind: 'supervise', role: 'product-owner', productOwnerMode: 'spar' });
    expect(parsedCommandLineOf(['supervise', 'example-tracker', '/example/root', 'orchestrator', 'file']).kind).toBe('refused');
    expect(parsedCommandLineOf(['supervise', 'example-tracker', '/example/root', 'product-owner', 'example-mode']).kind).toBe('refused');
  });

  test('stop and status take no options', () => {
    expect(parsedCommandLineOf(['stop'])).toMatchObject({ kind: 'command', command: 'stop' });
    expect(parsedCommandLineOf(['status'])).toMatchObject({ kind: 'command', command: 'status' });
    expect(parsedCommandLineOf(['stop', '--port', '4711'])).toEqual({ kind: 'refused', reason: 'stop takes no --port option.' });
  });

  test('reboot is restart under another word, both taking --port and refusing --no-open', () => {
    const restart = { kind: 'command', command: 'restart', options: { port: EXAMPLE_PORT, portIsGiven: true, browserOpens: true } } as const;
    expect(parsedCommandLineOf(['restart', '--port', String(EXAMPLE_PORT)])).toEqual(restart);
    expect(parsedCommandLineOf(['reboot', '--port', String(EXAMPLE_PORT)])).toEqual(restart);
    expect(parsedCommandLineOf(['reboot', '--no-open'])).toEqual({ kind: 'refused', reason: 'restart takes no --no-open option.' });
  });

  test('help, --help and -h all ask for the help, --help even after a command', () => {
    for (const commandLine of [['help'], ['--help'], ['-h'], ['serve', '--help']]) expect(parsedCommandLineOf(commandLine)).toEqual({ kind: 'help' });
  });

  test('an unknown word is an unknown command, never an open', () => {
    expect(parsedCommandLineOf(['start'])).toEqual({ kind: 'unknown-command', commandWord: 'start' });
  });
});

describe('refusals', () => {
  test.each(['0', '65536', '80.5', 'abc', '-1', '+80'])('--port %s is refused as out of range or not a whole number', (portText) => {
    expect(parsedCommandLineOf(['open', `--port=${portText}`])).toMatchObject({ kind: 'refused', reason: expect.stringContaining(`"${portText}"`) });
  });

  test('--port with no value is refused, also when an option follows it', () => {
    expect(parsedCommandLineOf(['open', '--port'])).toEqual({ kind: 'refused', reason: '--port needs a value: --port <n>.' });
    expect(parsedCommandLineOf(['open', '--port', '--no-open'])).toEqual({ kind: 'refused', reason: '--port needs a value: --port <n>.' });
  });

  test('--port given twice is refused', () => {
    expect(parsedCommandLineOf(['serve', '--port', '4711', '--port', '4712'])).toEqual({ kind: 'refused', reason: '--port is given twice; give it once.' });
  });

  test('an unknown option, an option the command does not take and a stray argument are each refused by name', () => {
    expect(parsedCommandLineOf(['open', '--verbose'])).toEqual({ kind: 'refused', reason: 'Unknown option: "--verbose".' });
    expect(parsedCommandLineOf(['serve', '--no-open'])).toEqual({ kind: 'refused', reason: 'serve takes no --no-open option.' });
    expect(parsedCommandLineOf(['status', 'now'])).toEqual({ kind: 'refused', reason: 'status takes no argument "now".' });
    expect(parsedCommandLineOf(['help', 'serve'])).toEqual({ kind: 'refused', reason: 'help takes no arguments.' });
  });
});
