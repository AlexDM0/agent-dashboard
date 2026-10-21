/** The whole command reference, one screen: printed to standard output when asked, to standard error after an unknown command. */
export function helpText(): string {
  return `agent-dashboard: a local dashboard over every repository agent-progress tracks on this machine

Usage: agent-dashboard [command] [options]

  open [--port <n>] [--no-open]   The default. Reuse the running dashboard server, or start one in the
                                  background, then open it in the browser and print its URL. --no-open
                                  (or AGENT_DASHBOARD_NO_BROWSER=1) only prints the URL.
  serve [--port <n>]              Run the server in the foreground until interrupted.
  stop                            Stop the running server; nothing running is not an error. A record
                                  whose process runs but does not answer is left, and refused.
  status                          Print the running server's URL and process id, or that none runs.
  help                            Print this help.

--port picks the port on 127.0.0.1 (default 4710); a port held by anything else is refused, and so
is a --port other than the one the running dashboard server uses: stop it first.
The server record and log live in ~/.agent-progress-monitor/agent-dashboard/.
AGENT_DASHBOARD_AGENT_PROGRESS names the agent-progress executable instead of the one on PATH.

Exit codes: 0 done or nothing to do, 1 a refusal or an unknown command, 2 anything else.`;
}
