/** ACP launcher: one copied Grok home and one isolated CLI process per run. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createProgressRecorder } from '../acp-progress.mjs';

const pluginGrokRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceHome = process.env.CREW_GROK_SOURCE_HOME || path.join(path.dirname(fileURLToPath(import.meta.url)), 'home');
const executable = process.env.CREW_GROK_EXECUTABLE || path.join(process.env.USERPROFILE ?? '', '.grok/bin/grok.exe');
const tempParent = path.join(pluginGrokRoot, '.tmp');
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
  const config = await fs.readFile(path.join(sourceHome, 'config.toml'), 'utf8');
  if (/^\s*api_key\s*=\s*['"][^'"]+['"]/m.test(config)) {
    throw new Error('Use an env_key in the Grok source config; inline credentials are not supported.');
  }
  const credentialNames = [...config.matchAll(/^\s*env_key\s*=\s*"([^"]+)"/gm)].map(match => match[1]);
  if (credentialNames.some(name => !process.env[name])) {
    throw new Error('The Grok source config requires a credential environment variable that is absent.');
  }
  await fs.mkdir(tempParent, { recursive: true });
  tempRoot = await fs.mkdtemp(path.join(tempParent, 'run-'));
  const copiedHome = path.join(tempRoot, 'home');
  await fs.cp(sourceHome, copiedHome, { recursive: true });
  child = spawn(executable, ['--no-subagents', 'agent', 'stdio', '--leader-socket', path.join(copiedHome, 'leader-crew.sock')], {
    cwd: process.cwd(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GROK_HOME: copiedHome, NO_PROXY: '*', no_proxy: '*', GROK_MEMORY: '0', GROK_SUBAGENTS: '0' },
  });
  // Passive progress tap for the Crew lanes view; the protocol bytes are forwarded unchanged.
  progress = createProgressRecorder({ provider: 'grok' });
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
  process.stderr.write('Crew Grok ACP launcher failed. Check its configured executable, source home, and credential environment.\n');
  process.exitCode = 1;
} finally {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
}
