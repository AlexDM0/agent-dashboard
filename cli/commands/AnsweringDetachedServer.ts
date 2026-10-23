import { boardPortOf }                                    from '../../src/services/DashboardServer.ts';
import type { CommandContext }                            from '../CommandContext.ts';
import { CommandRefusal }                                 from '../CommandRefusal.ts';
import { portIsFree }                                     from '../PortIsFree.ts';
import { localServerUrlOf }                               from '../ServerIdentityProbe.ts';
import { serverLogPathOf }                                from '../ServerRecordFile.ts';
import { detachedServerAnswerOf, unansweredServerTextOf } from './DetachedServerAnswer.ts';
import { portHeldRefusalFor }                             from './PortHeldRefusal.ts';
import { startDetachedServer }                            from './StartDetachedServer.ts';

/** Starts a detached server on a port, and the board port above it, that nothing holds, and resolves once it answers there. */
export async function startAnsweringDetachedServer(context: CommandContext, port: number): Promise<void> {
  if (!portIsFree(port)) throw portHeldRefusalFor(port);
  if (!portIsFree(boardPortOf(port))) throw portHeldRefusalFor(boardPortOf(port), 'board');
  const answer = await detachedServerAnswerOf(localServerUrlOf(port), startDetachedServer(context, port));
  // A timeout is a refusal too: the person can read the log and try again, nothing here is broken beyond repair.
  if (answer.kind !== 'answered') throw new CommandRefusal(unansweredServerTextOf(answer, serverLogPathOf(context.homeDirectory)));
}
