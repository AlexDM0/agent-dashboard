import type { CommandContext } from '../CommandContext.ts';
import type { CommandOptions } from '../ParsedCommandLine.ts';

/** Resolves when the command is done; a `CommandRefusal` it throws exits 1, anything else 2. */
export type CommandHandler = (options: CommandOptions, context: CommandContext) => Promise<void>;
