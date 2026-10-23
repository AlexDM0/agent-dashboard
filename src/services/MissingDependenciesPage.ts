/**
 * The self-contained page `/` answers in place of the dashboard when a declared package does not resolve, since the
 * page's bundle cannot build then; its one button asks the server to restart once the install is done.
 */
import { DASHBOARD_PROTOCOL } from '../shared/constants/DashboardProtocol.ts';

const HTML_ESCAPES = new Map([['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;'], ['"', '&quot;'], ['\'', '&#39;']]);

function escapedHtmlOf(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES.get(character) ?? character);
}

/** Long enough for the old server to close its ports and the successor to bind them before the page reloads. */
const RELOAD_AFTER_RESTART_MILLISECONDS = 3000;

function restartScriptOf(): string {
  const restartHeaders = JSON.stringify({ [DASHBOARD_PROTOCOL.RESTART_HEADER_NAME]: DASHBOARD_PROTOCOL.RESTART_HEADER_VALUE });
  return [
    'document.getElementById("restart").addEventListener("click", async (event) => {',
    '  event.target.disabled = true;',
    '  event.target.textContent = "Restarting...";',
    `  await fetch(${JSON.stringify(DASHBOARD_PROTOCOL.RESTART_PATH)}, { method: "POST", headers: ${restartHeaders} }).catch(() => {});`,
    `  setTimeout(() => location.reload(), ${RELOAD_AFTER_RESTART_MILLISECONDS});`,
    '});',
  ].join('\n');
}

export function missingDependenciesPageOf(packageNames: readonly string[], dashboardDirectory: string): string {
  const packageItems = packageNames.map((packageName) => `<li><code>${escapedHtmlOf(packageName)}</code></li>`).join('');
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>agent-dashboard: packages not installed</title>',
    '<style>body { font: 15px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #1f2328; }',
    'code { background: #f0f1f3; padding: 0 0.25rem; border-radius: 3px; } button { font: inherit; padding: 0.3rem 0.9rem; }</style></head>',
    '<body>',
    '<h1>The dashboard page cannot be built</h1>',
    `<p>These packages that <code>package.json</code> declares are not installed in <code>${escapedHtmlOf(dashboardDirectory)}</code>:</p>`,
    `<ul>${packageItems}</ul>`,
    `<p>Run <code>bun run setup</code> (or <code>bun install</code>) in <code>${escapedHtmlOf(dashboardDirectory)}</code>, then restart the server.</p>`,
    '<p><button id="restart" type="button">Restart server</button></p>',
    `<script>${restartScriptOf()}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
