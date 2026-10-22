/** The bridge page's entry point, bundled on its own by the server and served on the board origin. */
import { startBoardBridge } from './BoardBridge.ts';

startBoardBridge(window);
