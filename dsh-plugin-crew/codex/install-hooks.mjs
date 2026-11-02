/**
 * Install the Crew progress hook into a Codex home used by DSH's official Codex provider:
 * writes hooks.json, enables `[features] hooks`, then trusts exactly these hooks through Codex's own app-server API
 * (hooks/list → config/batchWrite), the same record the Codex TUI writes when a person presses "Trust".
 * Trust is keyed by the hooks.json path and its hash, so re-run after moving the home or editing the hook command.
 * Usage: node install-hooks.mjs <CODEX_HOME> [--list]
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

if (!process.argv[2]) throw new Error('usage: node install-hooks.mjs <CODEX_HOME> [--list]')
const codexHome = path.resolve(process.argv[2])
const here = path.dirname(fileURLToPath(import.meta.url))
// Tool hooks run async so they never slow a tool call; prompt and Stop run sync so they are not lost when Codex exits.
const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']

if (!process.argv.includes('--list')) {
  // Codex runs hook commands through the platform shell (PowerShell on Windows, where a quoted program path is only a
  // string), so the command is bare: node from PATH plus a space-free forward-slash path.
  const hookPath = path.join(here, 'hook.mjs').replaceAll(path.sep, '/')
  if (hookPath.includes(' ')) throw new Error('hook path must not contain spaces: ' + hookPath)
  const command = `node ${hookPath}`
  const hooks = Object.fromEntries(EVENTS.map(event => [event, [{ matcher: '.*', hooks: [{ type: 'command', command, timeout: 10, async: event === 'PreToolUse' || event === 'PostToolUse' }] }]]))
  fs.writeFileSync(path.join(codexHome, 'hooks.json'), JSON.stringify({ hooks }, null, 2) + '\n', 'utf8')
}

// The same Codex build DSH's official Codex provider spawns: @deepseek-ai/dsh-subagent-codex installed next to this plugin
// (profile node_modules) or in a DSH runtime folder above it. CREW_CODEX_EXECUTABLE overrides.
function findSubagentCodex() {
  for (let dir = here; ; dir = path.dirname(dir)) {
    for (const base of ['node_modules', 'runtime/node_modules']) {
      const manifest = path.join(dir, base, '@deepseek-ai/dsh-subagent-codex/package.json')
      if (fs.existsSync(manifest)) return manifest
    }
    if (path.dirname(dir) === dir) throw new Error('@deepseek-ai/dsh-subagent-codex not found above ' + here + '; install it with dsh plugin add, or set CREW_CODEX_EXECUTABLE')
  }
}
function findCodexExecutable() {
  if (process.env.CREW_CODEX_EXECUTABLE) return process.env.CREW_CODEX_EXECUTABLE
  const codexManifest = createRequire(findSubagentCodex()).resolve('@openai/codex/package.json')
  const relative = 'vendor/x86_64-pc-windows-msvc/bin/codex.exe'
  try { return path.join(path.dirname(createRequire(codexManifest).resolve('@openai/codex-win32-x64/package.json')), relative) }
  catch { return path.join(path.dirname(codexManifest), '../codex-win32-x64', relative) }
}
const executable = findCodexExecutable()
if (!fs.existsSync(executable)) throw new Error('Codex executable not found: ' + executable)
const child = spawn(executable, ['app-server'], { env: { ...process.env, CODEX_HOME: codexHome }, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
const pending = new Map(); let next = 0
createInterface({ input: child.stdout }).on('line', line => {
  let message; try { message = JSON.parse(line) } catch { return }
  if (message.id !== undefined && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
})
const call = (method, params) => new Promise((done, reject) => {
  const id = ++next; const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 30000)
  pending.set(id, message => { clearTimeout(timer); message.error ? reject(new Error(`${method}: ${JSON.stringify(message.error)}`)) : done(message.result) })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
})
try {
  await call('initialize', { clientInfo: { name: 'crew-install-hooks', title: 'Crew hook installer', version: '1.0.0' }, capabilities: { experimentalApi: true } })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized' }) + '\n')
  if (!process.argv.includes('--list')) await call('config/batchWrite', { edits: [{ keyPath: 'features.hooks', value: true, mergeStrategy: 'replace' }] })
  const listed = await call('hooks/list', { cwds: [codexHome] })
  const hooks = (listed.data ?? []).flatMap(entry => entry.hooks ?? [])
  if (process.argv.includes('--list')) {
    for (const hook of hooks) console.log(`${hook.trustStatus.padEnd(10)} ${hook.eventName.padEnd(18)} ${hook.key}`)
  } else {
    // Only hooks from this installer's hooks.json are trusted.
    const ours = hooks.filter(hook => hook.sourcePath && path.resolve(hook.sourcePath) === path.join(codexHome, 'hooks.json') && hook.currentHash)
    if (ours.length !== EVENTS.length) throw new Error(`expected ${EVENTS.length} Crew hooks, found ${ours.length}`)
    await call('config/batchWrite', { edits: ours.flatMap(hook => [
      { keyPath: `hooks.state.${JSON.stringify(hook.key)}.enabled`, value: true, mergeStrategy: 'replace' },
      { keyPath: `hooks.state.${JSON.stringify(hook.key)}.trusted_hash`, value: hook.currentHash, mergeStrategy: 'replace' },
    ]) })
    const after = (await call('hooks/list', { cwds: [codexHome] })).data.flatMap(entry => entry.hooks)
    const trusted = after.filter(hook => ours.some(item => item.key === hook.key) && hook.trustStatus === 'trusted').length
    console.log(`Crew progress hooks installed in ${codexHome}: ${trusted}/${EVENTS.length} trusted`)
    if (trusted !== EVENTS.length) process.exitCode = 1
  }
} finally { child.kill() }
