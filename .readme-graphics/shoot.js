// Screenshots of local HTML files (the composed panels, frames and diagrams) from a JSON job list; each job's `html` is an absolute path.
// Usage: bun shoot.js <jobs.json>
import { existsSync, readFileSync } from 'node:fs';

import { launchChrome } from './chrome.js';

const [jobsPath] = process.argv.slice(2);
if (!jobsPath) throw new Error('usage: bun shoot.js <jobs.json>');
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));

// Every file is served under /files/<absolute path>, so a page's relative links resolve as they would on disk.
const server = Bun.serve({
  port:     0,
  hostname: '127.0.0.1',
  fetch(request) {
    const requestedPath = decodeURIComponent(new URL(request.url).pathname);
    if (!requestedPath.startsWith('/files/')) return new Response('not found', { status: 404 });
    const filePath = requestedPath.slice('/files'.length);
    if (!existsSync(filePath)) return new Response('not found', { status: 404 });
    return new Response(Bun.file(filePath), { headers: { 'cache-control': 'no-store' } });
  },
});

const chrome = await launchChrome();
try {
  for (const job of jobs) await chrome.capture({ ...job, url: `http://127.0.0.1:${server.port}/files${job.html}` });
} finally {
  await chrome.close();
  server.stop(true);
}
console.log(`shot ${jobs.length} image(s) from ${jobsPath}`);
