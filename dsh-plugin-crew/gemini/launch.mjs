/** ACP launcher: one temporary Gemini CLI home and one isolated `gemini --acp` process per run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createProgressRecorder } from '../acp-progress.mjs';

const pluginGeminiRoot = path.dirname(fileURLToPath(import.meta.url));
// Default: the global npm install of @google/gemini-cli (npm i -g @google/gemini-cli).
const entry = process.env.CREW_GEMINI_ENTRY || path.join(process.env.APPDATA ?? '', 'npm/node_modules/@google/gemini-cli/bundle/gemini.js');
const model = process.env.CREW_GEMINI_MODEL || 'gemini-3.7-flash';
// Optional relay endpoint; without it Gemini CLI talks to Google with the API key.
const baseUrl = process.env.CREW_GEMINI_BASE_URL;
const tempParent = path.join(pluginGeminiRoot, '.tmp');
const settings = {
  security: { auth: { selectedType: 'gemini-api-key' } },
  privacy: { usageStatisticsEnabled: false },
  general: { disableAutoUpdate: true },
};
let tempRoot;
let child;
let progress;
let closing = false;

async function terminate() {
  if (closing) return;
  closing = true;
  child?.stdin.end();
  if (child && child.exitCode === null && child.signalCode === null) {
    if (process.platform === 'win32') {
      await new Promise(resolve => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('close', resolve); killer.once('error', resolve);
      });
    } else child.kill('SIGTERM');
  }
}

try {
  const apiKey = process.env.CREW_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('missing credential');
  await fs.mkdir(tempParent, { recursive: true });
  tempRoot = await fs.mkdtemp(path.join(tempParent, 'run-'));
  await fs.mkdir(path.join(tempRoot, '.gemini'), { recursive: true });
  await fs.writeFile(path.join(tempRoot, '.gemini', 'settings.json'), JSON.stringify(settings, null, 2), 'utf8');
  child = spawn(process.execPath, [entry, '--acp', '-m', model, '--approval-mode', 'yolo'], {
    cwd: process.cwd(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env, GEMINI_API_KEY: apiKey, ...(baseUrl ? { GOOGLE_GEMINI_BASE_URL: baseUrl } : {}),
      GEMINI_CLI_HOME: tempRoot, GEMINI_CLI_TRUST_WORKSPACE: 'true', GEMINI_CLI_NO_RELAUNCH: 'true',
      NO_PROXY: '*', no_proxy: '*',
    },
  });
  // Passive progress tap for the Crew lanes view; the protocol bytes are forwarded unchanged.
  progress = createProgressRecorder({ provider: 'gemini' });
  process.stdin.on('data', chunk => progress.client(chunk));
  child.stdout.on('data', chunk => progress.agent(chunk));
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  // ACP stdout remains protocol-only. Stderr is inherited by DSH's managed process.
  child.stderr.pipe(process.stderr);
  child.stdin.on('error', () => {});
  process.once('SIGINT', () => { void terminate(); });
  process.once('SIGTERM', () => { void terminate(); });
  const code = await new Promise((resolve, reject) => {
    child.once('close', (code, signal) => { resolve(code ?? (signal ? 1 : 0)); });
    child.once('error', reject);
  });
  progress?.finish(Number(code));
  process.exitCode = Number(code);
} catch {
  // Do not echo config, credentials, protocol payloads, or filesystem contents.
  process.stderr.write('Crew Gemini ACP launcher failed. Check its CLI entry and credential environment.\n');
  process.exitCode = 1;
} finally {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
}
