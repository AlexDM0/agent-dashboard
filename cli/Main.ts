/**
 * The dispatch, and the only place an exit code is decided: 0 done or nothing to do, 1 a refusal or an unknown command, 2
 * anything else. It returns the number rather than exiting.
 */
import type { CommandContext }                   from './CommandContext.ts';
import { CommandRefusal }                        from './CommandRefusal.ts';
import { helpText }                              from './HelpText.ts';
import { type CommandName, parsedCommandLineOf } from './ParsedCommandLine.ts';
import type { CommandHandler }                   from './commands/CommandHandler.ts';

/** Loaded on demand, so `help` and a refused argument never load the server. */
const COMMAND_LOADERS: Record<Exclude<CommandName, 'help'>, () => Promise<CommandHandler>> = {
  open:    async () => (await import('./commands/OpenCommand.ts')).openCommand,
  serve:   async () => (await import('./commands/ServeCommand.ts')).serveCommand,
  stop:    async () => (await import('./commands/StopCommand.ts')).stopCommand,
  restart: async () => (await import('./commands/RestartCommand.ts')).restartCommand,
  status:  async () => (await import('./commands/StatusCommand.ts')).statusCommand,
};

export async function runCommandLine(commandLineArguments: readonly string[], context: CommandContext): Promise<number> {
  const parsed = parsedCommandLineOf(commandLineArguments);
  switch (parsed.kind) {
    case 'help':
      context.standardOutput(helpText());
      return 0;
    case 'unknown-command':
      context.standardError(`Unknown command: "${parsed.commandWord}".\n`);
      context.standardError(helpText());
      return 1;
    case 'refused':
      context.standardError(`${parsed.reason} See agent-dashboard help.`);
      return 1;
    case 'supervise':
    case 'command':
      break;
  }
  try {
    if (parsed.kind === 'supervise') {
      const { superviseCommand } = await import('./commands/SuperviseCommand.ts');
      await superviseCommand(parsed.trackerId, parsed.root, parsed.role, parsed.productOwnerMode, context);
      return 0;
    }
    const runCommand = await COMMAND_LOADERS[parsed.command]();
    await runCommand(parsed.options, context);
    return 0;
  } catch (problem) {
    context.standardError(problem instanceof Error ? problem.message : String(problem));
    return problem instanceof CommandRefusal ? 1 : 2;
  }
}
