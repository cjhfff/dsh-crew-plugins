/**
 * Crew progress hook for Codex (native Codex hooks: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop).
 * Appends one compact line per event to <progress dir>/codex-<session_id>.jsonl; acp-progress.mjs folds it into a run.
 * Never prints (Codex parses hook stdout) and always exits 0, so it cannot block or alter the Codex run.
 */
import fs from 'node:fs'
import path from 'node:path'
import { progressDir } from '../acp-progress.mjs'

const clip = (value, max) => String(value ?? '').slice(0, max)
let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => { input += chunk })
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(input)
    const session = String(event.session_id || '').replace(/[^\w.-]/g, '')
    if (!session) return
    const line = { at: Date.now(), event: event.hook_event_name }
    switch (event.hook_event_name) {
      case 'SessionStart': line.cwd = clip(event.cwd, 400); break
      case 'UserPromptSubmit': line.prompt = clip(event.prompt, 4000); break
      case 'PreToolUse': {
        // Store the command text itself: clipping a JSON-encoded input could cut it into unparseable JSON.
        const input = event.tool_input, command = Array.isArray(input?.command) ? input.command.join(' ') : input?.command ?? input?.cmd
        Object.assign(line, { id: clip(event.tool_use_id, 120), tool: clip(event.tool_name, 80), input: clip(typeof command === 'string' ? command : typeof input === 'string' ? input : JSON.stringify(input ?? {}), 1200) })
        break
      }
      case 'PostToolUse': Object.assign(line, { id: clip(event.tool_use_id, 120), tool: clip(event.tool_name, 80), output: clip(typeof event.tool_response === 'string' ? event.tool_response : JSON.stringify(event.tool_response ?? ''), 400) }); break
      case 'Stop': line.message = clip(event.last_assistant_message, 4000); break
      default: return
    }
    const dir = progressDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, `codex-${session}.jsonl`), JSON.stringify(line) + '\n')
  } catch {}
})
