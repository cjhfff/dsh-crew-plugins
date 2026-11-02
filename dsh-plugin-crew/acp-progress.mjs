/**
 * Crew progress tap for ACP executors (Gemini, Grok). DSH's ACP provider keeps only the final message text,
 * so the launchers, which already sit between DSH and the CLI, record each run's public ACP updates
 * (tool calls, plan, message text) to one JSON file per run. The Crew Host serves these files to the lanes view.
 * Recording is passive: a failure here never alters or blocks the protocol stream.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

const RETAIN_MS = 7 * 24 * 3600 * 1000
const MAX_TOOLS = 300
const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

/** Directory shared by launchers and the Crew Host. */
export function progressDir(env = process.env) {
  if (env.CREW_PROGRESS_DIR) return env.CREW_PROGRESS_DIR
  return env.DSH_HOME ? path.join(env.DSH_HOME, 'crew-progress') : path.join(pluginRoot, '.progress')
}

const textOf = blocks => (Array.isArray(blocks) ? blocks : []).filter(block => block?.type === 'text').map(block => String(block.text)).join('\n')
const clip = (value, max) => String(value ?? '').slice(0, max)

function prune(dir) {
  const cutoff = Date.now() - RETAIN_MS
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name)
    try { if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true }) } catch {}
  }
}

/**
 * Start recording one ACP run.
 * @param {{provider: string, cwd?: string, dir?: string}} options
 * @returns {{client: (chunk: Buffer) => void, agent: (chunk: Buffer) => void, finish: (exitCode: number) => void}}
 */
export function createProgressRecorder({ provider, cwd = process.cwd(), dir = progressDir() }) {
  const noop = { client() {}, agent() {}, finish() {} }
  let file
  const startedAt = Date.now()
  const run = { id: `${startedAt}-${provider}-${randomUUID().slice(0, 8)}`, provider, cwd, startedAt, updatedAt: startedAt, endedAt: null,
    exitCode: null, stopReason: null, prompt: '', tools: [], plan: [], message: '', thoughts: 0 }
  try { fs.mkdirSync(dir, { recursive: true }); prune(dir); file = path.join(dir, `${run.id}.json`) } catch { return noop }
  const tools = new Map()
  let timer
  const flush = () => {
    timer = undefined; run.updatedAt = Date.now()
    try { fs.writeFileSync(`${file}.tmp`, JSON.stringify(run)); fs.renameSync(`${file}.tmp`, file) } catch {}
  }
  const changed = () => { if (!timer) timer = setTimeout(flush, 400) }

  const onClient = message => {
    if (message.method === 'session/prompt') { run.prompt = clip(textOf(message.params?.prompt), 4000); changed() }
  }
  const onAgent = message => {
    if (message.method !== 'session/update') {
      if (message.id !== undefined && typeof message.result?.stopReason === 'string') { run.stopReason = message.result.stopReason; changed() }
      return
    }
    const update = message.params?.update
    switch (update?.sessionUpdate) {
      case 'agent_message_chunk': if (update.content?.type === 'text') run.message = (run.message + update.content.text).slice(-4000); break
      case 'agent_thought_chunk': run.thoughts++; break
      case 'tool_call': {
        const tool = { id: String(update.toolCallId), title: clip(update.title || update.kind || 'tool', 200), kind: update.kind || 'other',
          status: update.status || 'pending', at: Date.now(), paths: (update.locations || []).map(location => clip(location?.path, 260)).slice(0, 5) }
        tools.set(tool.id, tool); run.tools.push(tool)
        if (run.tools.length > MAX_TOOLS) run.tools.splice(0, run.tools.length - MAX_TOOLS)
        break
      }
      case 'tool_call_update': {
        const tool = tools.get(String(update.toolCallId))
        if (!tool) return
        if (update.title) tool.title = clip(update.title, 200)
        if (update.status) { tool.status = update.status; if (update.status === 'completed' || update.status === 'failed') tool.endedAt = Date.now() }
        break
      }
      case 'plan': run.plan = (update.entries || []).slice(0, 50).map(entry => ({ content: clip(entry?.content, 200), status: entry?.status || 'pending' })); break
      default: return
    }
    changed()
  }
  /** Newline-delimited JSON-RPC reader; malformed lines are skipped. */
  const reader = handle => {
    const decoder = new StringDecoder('utf8')
    let buffer = ''
    return chunk => {
      try {
        buffer += decoder.write(chunk)
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1)
          if (line) { try { handle(JSON.parse(line)) } catch {} }
        }
        if (buffer.length > 8_000_000) buffer = ''
      } catch {}
    }
  }
  flush()
  return {
    client: reader(onClient),
    agent: reader(onAgent),
    finish(exitCode) { clearTimeout(timer); run.endedAt = Date.now(); run.exitCode = exitCode; flush() },
  }
}

/** Short step title for a Codex tool call: the shell command's first line or the files an apply_patch touches. */
function codexTitle(tool, input) {
  let args = input
  try { args = JSON.parse(input) } catch {
    // Older logs stored clipped JSON; recover the leading command string.
    const head = /^\{"(?:command|cmd)":"((?:[^"\\]|\\.)*)/.exec(String(input))
    if (head) args = head[1].replace(/\\(["\\/])/g, '$1').replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\t/g, '\t')
  }
  const command = typeof args === 'object' && args ? args.command ?? args.cmd : args
  const text = Array.isArray(command) ? command.join(' ') : String(command ?? '')
  // Patches arrive raw, inside PowerShell here-strings, or inline with `n escapes.
  const files = [...new Set([...text.matchAll(/(?:^|`n|\\n)\*\*\* (?:Add|Update|Delete) File: (.+?)(?=\\n|`n|["'`\r\n]|$)/gm)].map(match => match[1].trim()))].filter(file => file.length > 1)
  if (files.length) return { title: `Edit ${files.map(file => file.split(/[\\/]/).pop()).join(', ')}`, kind: 'edit', paths: files.slice(0, 5) }
  const line = text.split(/\r?\n/).map(part => part.trim()).find(part => part.length > 3) ?? text.trim()
  if (/^Bash$|shell|exec/i.test(tool) && text) return { title: clip(line, 200), kind: 'execute', paths: [] }
  return { title: clip(tool || 'tool', 200), kind: 'other', paths: [] }
}

/**
 * Fold one Codex hook log (codex/hook.mjs lines) into the run shape the ACP recorder writes.
 * PostToolUse marks a step completed; Codex hooks do not report a tool's success separately.
 */
export function foldCodexLog(text, session) {
  // Async tool hooks may append out of order; event time restores it.
  const lines = String(text).split('\n').flatMap(line => { try { return line.trim() ? [JSON.parse(line)] : [] } catch { return [] } }).sort((a, b) => a.at - b.at)
  if (!lines.length) return undefined
  const run = { id: `codex-${session}`, provider: 'codex', cwd: '', startedAt: lines[0].at, updatedAt: lines.at(-1).at, endedAt: null,
    exitCode: null, stopReason: null, prompt: '', tools: [], plan: [], message: '', thoughts: 0 }
  const tools = new Map(), done = new Map()
  for (const line of lines) {
    if (line.event === 'SessionStart') run.cwd = line.cwd || run.cwd
    else if (line.event === 'UserPromptSubmit' && !run.prompt) run.prompt = line.prompt || ''
    else if (line.event === 'PreToolUse' && !tools.has(line.id)) {
      const finished = done.get(line.id)
      const tool = { id: line.id, ...codexTitle(line.tool, line.input), status: finished ? 'completed' : 'in_progress', at: line.at, ...(finished ? { endedAt: finished } : {}) }
      tools.set(line.id, tool); run.tools.push(tool)
    } else if (line.event === 'PostToolUse') {
      const tool = tools.get(line.id)
      if (tool) Object.assign(tool, { status: 'completed', endedAt: line.at }); else done.set(line.id, line.at)
    } else if (line.event === 'Stop') Object.assign(run, { message: line.message || '', endedAt: line.at, stopReason: 'end_turn', exitCode: 0 })
  }
  if (run.tools.length > MAX_TOOLS) run.tools.splice(0, run.tools.length - MAX_TOOLS)
  return run
}

/**
 * Read recorded runs started at or after `since`, newest last: ACP recordings (<started>-<provider>-<id>.json)
 * and Codex hook logs (codex-<session>.jsonl).
 * @param {{since?: number, dir?: string, limit?: number}} options
 */
export function readRuns({ since = 0, dir = progressDir(), limit = 100 } = {}) {
  let names
  try { names = fs.readdirSync(dir) } catch { return [] }
  const runs = []
  for (const name of names) {
    const file = path.join(dir, name)
    try {
      if (name.endsWith('.json')) {
        if (Number(name.split('-', 1)[0]) >= since) runs.push(JSON.parse(fs.readFileSync(file, 'utf8')))
      } else if (name.startsWith('codex-') && name.endsWith('.jsonl') && fs.statSync(file).mtimeMs >= since) {
        const run = foldCodexLog(fs.readFileSync(file, 'utf8'), name.slice(6, -6))
        if (run && run.startedAt >= since) runs.push(run)
      }
    } catch {}
  }
  return runs.sort((a, b) => a.startedAt - b.startedAt).slice(-limit)
}
