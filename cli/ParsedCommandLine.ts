/**
 * The whole command line read into one verdict: a command with its options, a request for help, an unknown command word, or
 * a refusal worded for the person who typed it.
 */
import type { ProductOwnerMode, SessionRole } from '../src/shared/DashboardContract.ts';
import { DASHBOARD_LIMITS }                   from '../src/shared/constants/DashboardLimits.ts';
import { DASHBOARD_PROTOCOL }                 from '../src/shared/constants/DashboardProtocol.ts';
import { PRODUCT_OWNER_MODES, SESSION_ROLES } from '../src/shared/constants/SessionRoles.ts';
import { COMMAND_LINE_LIMITS }                from './constants/CommandLineLimits.ts';

export type CommandName = 'open' | 'serve' | 'stop' | 'restart' | 'status' | 'help';

export interface CommandOptions {
  port:         number;
  /** Whether `--port` was typed, so `open` can tell a port asked for from the default. */
  portIsGiven:  boolean;
  browserOpens: boolean;
}

export type ParsedCommandLine =
  | { kind: 'command'; command: Exclude<CommandName, 'help'>; options: CommandOptions }
  | { kind: 'help' }
  | {
    kind:             'supervise';
    trackerId:        string;
    root:             string;
    role:             SessionRole;
    productOwnerMode: ProductOwnerMode | null;
    launchId:         string | null;
    topic:            string | null;
  }
  | { kind: 'unknown-command'; commandWord: string }
  | { kind: 'refused'; reason: string };

type OptionName = '--port' | '--no-open';

const OPTIONS_OF_EACH_COMMAND: Record<Exclude<CommandName, 'help'>, readonly OptionName[]> = {
  open:    ['--port', '--no-open'],
  serve:   ['--port'],
  stop:    [],
  restart: ['--port'],
  status:  [],
};

const COMMAND_ALIASES: Record<string, Exclude<CommandName, 'help'>> = { reboot: 'restart', };

const HELP_WORDS = new Set(['help', '--help', '-h']);

const PORT_OPTION_PREFIX = '--port=';

function commandNameOf(word: string): Exclude<CommandName, 'help'> | null {
  if (Object.hasOwn(COMMAND_ALIASES, word)) return COMMAND_ALIASES[word] ?? null;
  return Object.hasOwn(OPTIONS_OF_EACH_COMMAND, word) ? word as Exclude<CommandName, 'help'> : null;
}

function portFrom(text: string): number | null {
  if (!/^\d+$/u.test(text)) return null;
  const port = Number(text);
  return port >= COMMAND_LINE_LIMITS.LOWEST_PORT && port <= COMMAND_LINE_LIMITS.HIGHEST_PORT ? port : null;
}

function portRefusal(text: string): ParsedCommandLine {
  return {
    kind:   'refused',
    reason: `--port takes a whole number from ${COMMAND_LINE_LIMITS.LOWEST_PORT} to ${COMMAND_LINE_LIMITS.HIGHEST_PORT}, not "${text}".`,
  };
}

function optionNotTakenRefusal(optionName: string, command: string): ParsedCommandLine {
  return { kind: 'refused', reason: `${command} takes no ${optionName} option.` };
}

function optionsFor(command: Exclude<CommandName, 'help'>, optionArguments: readonly string[]): ParsedCommandLine {
  const allowedOptions = OPTIONS_OF_EACH_COMMAND[command];
  let port: number | null = null;
  let browserOpens = true;
  for (let i = 0; i < optionArguments.length; i++) {
    const argument = optionArguments[i] ?? '';
    if (argument === '--port' || argument.startsWith(PORT_OPTION_PREFIX)) {
      if (!allowedOptions.includes('--port')) return optionNotTakenRefusal('--port', command);
      if (port !== null) return { kind: 'refused', reason: '--port is given twice; give it once.' };
      const inlineValue = argument.startsWith(PORT_OPTION_PREFIX) ? argument.slice(PORT_OPTION_PREFIX.length) : null;
      const portText = inlineValue ?? optionArguments[++i];
      if (portText === undefined || portText.startsWith('--')) return { kind: 'refused', reason: '--port needs a value: --port <n>.' };
      port = portFrom(portText);
      if (port === null) return portRefusal(portText);
    } else if (argument === '--no-open') {
      if (!allowedOptions.includes('--no-open')) return optionNotTakenRefusal('--no-open', command);
      browserOpens = false;
    } else if (argument.startsWith('-')) {
      return { kind: 'refused', reason: `Unknown option: "${argument}".` };
    } else {
      return { kind: 'refused', reason: `${command} takes no argument "${argument}".` };
    }
  }
  return { kind: 'command', command, options: { port: port ?? DASHBOARD_LIMITS.DEFAULT_PORT, portIsGiven: port !== null, browserOpens } };
}

/**
 * A product owner's mode, launch id and topic follow its role, each optional after the last. Read before any help word
 * is looked for, since a topic is the user's own text and may be one.
 */
function supervisionOf(supervisionArguments: readonly string[]): ParsedCommandLine {
  const [trackerId, root, role, mode, launchId, topic, ...extraArguments] = supervisionArguments;
  const sessionRole = SESSION_ROLES.find((knownRole) => knownRole === role);
  const productOwnerMode = PRODUCT_OWNER_MODES.find((knownMode) => knownMode === mode) ?? null;
  const modeIsWellPlaced = mode === undefined || (sessionRole === 'product-owner' && productOwnerMode !== null);
  if (trackerId === undefined || root === undefined || sessionRole === undefined || !modeIsWellPlaced || launchId === '' || extraArguments.length > 0) {
    return {
      kind:   'refused',
      reason: `supervise takes a tracker id, a project root, a role (${SESSION_ROLES.join(' or ')}) and, for a product owner, `
        + `a mode (${PRODUCT_OWNER_MODES.join(' or ')}), optionally followed by a launch id and a topic.`
    };
  }
  return {
    kind: 'supervise', trackerId, root, role: sessionRole, productOwnerMode, launchId: launchId ?? null, topic: topic ?? null
  };
}

/** No command word, or options alone, is `open`: the bare `agent-dashboard` is the everyday call. */
export function parsedCommandLineOf(commandLineArguments: readonly string[]): ParsedCommandLine {
  const [firstArgument, ...remainingArguments] = commandLineArguments;
  if (firstArgument === DASHBOARD_PROTOCOL.SUPERVISE_COMMAND) return supervisionOf(remainingArguments);
  if (commandLineArguments.some((argument) => HELP_WORDS.has(argument) && argument !== 'help')) return { kind: 'help' };
  if (firstArgument === undefined) return optionsFor('open', []);
  if (firstArgument === 'help') return remainingArguments.length === 0 ? { kind: 'help' } : { kind: 'refused', reason: 'help takes no arguments.' };
  if (firstArgument.startsWith('-')) return optionsFor('open', commandLineArguments);
  const command = commandNameOf(firstArgument);
  if (command === null) return { kind: 'unknown-command', commandWord: firstArgument };
  return optionsFor(command, remainingArguments);
}
