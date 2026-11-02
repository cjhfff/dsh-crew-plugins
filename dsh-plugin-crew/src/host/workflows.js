/**
 * Fixed workflows: DSH skills (one `<name>/SKILL.md` each, invoked with `/name`) in the user-level skill root, so every preset sees them.
 * DSH's sandbox only lets agents write inside their workspace, so the folder is written by this Host-side tool
 * instead of the agent's file tools. Each save validates the name and files and keeps the previous version.
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** The user-level skill root every DSH preset scans (standard, Crew, …); CREW_WORKFLOWS_DIR overrides it for isolated side Hosts. */
export const WORKFLOWS_DIR = process.env.CREW_WORKFLOWS_DIR || path.join(os.homedir(), '.agents', 'skills')
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FILE = /^(?:scripts|references|assets)(?:\/[A-Za-z0-9._-]+)+$/
const MAX_FILE = 200_000, MAX_TOTAL = 1_000_000

const yamlString = value => JSON.stringify(String(value))

/** Version number recorded in an existing SKILL.md, or 0. */
async function currentVersion(file) {
  try { return Number(/^\s+version:\s*(\d+)\s*$/m.exec(await fs.readFile(file, 'utf8'))?.[1] ?? 0) } catch { return 0 }
}

/**
 * Write or replace one fixed workflow.
 * @param {{name: string, title: string, description: string, body: string, files?: Record<string,string>, modelInvocable?: boolean}} args
 * @param {{root?: string, history?: string, now?: Date}} [options]
 */
export async function saveWorkflow(args, { root = WORKFLOWS_DIR, history = `${root}-history`, now = new Date() } = {}) {
  const name = String(args.name ?? '').trim()
  if (!NAME.test(name) || name.length > 64) throw new Error('name must be lowercase kebab-case ASCII (a-z, 0-9, -), at most 64 characters, e.g. selinux-from-logs')
  const title = String(args.title ?? '').trim(), description = String(args.description ?? '').trim(), body = String(args.body ?? '').trim()
  if (!title || !description) throw new Error('title and description are required')
  if (body.length < 80) throw new Error('body must be the full SOP (inputs, fixed steps, checks, prohibitions, deliverables)')
  const files = args.files ?? undefined
  if (files !== undefined) {
    if (typeof files !== 'object' || Array.isArray(files)) throw new Error('files must map relative paths to text content')
    let total = 0
    for (const [file, content] of Object.entries(files)) {
      if (!FILE.test(file) || file.split('/').includes('..')) throw new Error(`file path not allowed: ${file} (use scripts/, references/ or assets/)`)
      if (typeof content !== 'string' || content.length > MAX_FILE) throw new Error(`file ${file} must be text up to ${MAX_FILE} characters`)
      total += content.length
    }
    if (total > MAX_TOTAL) throw new Error('files exceed 1 MB in total')
  }
  const dir = path.join(root, name), skillFile = path.join(dir, 'SKILL.md')
  const previous = await currentVersion(skillFile)
  let backup
  if (previous || await fs.stat(dir).then(() => true, () => false)) {
    backup = path.join(history, name, `v${previous}-${now.toISOString().replace(/[:.]/g, '-')}`)
    await fs.mkdir(path.dirname(backup), { recursive: true })
    await fs.cp(dir, backup, { recursive: true })
  }
  if (files !== undefined) for (const sub of ['scripts', 'references', 'assets']) await fs.rm(path.join(dir, sub), { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  const version = previous + 1
  const frontmatter = [
    '---',
    `name: ${name}`,
    `description: ${yamlString(`${title}：${description}`)}`,
    ...(args.modelInvocable === true ? [] : ['disable-model-invocation: true']),
    'metadata:',
    '  kind: crew-fixed-workflow',
    `  title: ${yamlString(title)}`,
    `  version: ${version}`,
    `  updatedAt: ${yamlString(now.toISOString())}`,
    '---',
  ].join('\n')
  for (const [file, content] of Object.entries(files ?? {})) {
    const target = path.join(dir, ...file.split('/'))
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf8')
  }
  await fs.writeFile(skillFile, `${frontmatter}\n\n${body}\n`, 'utf8')
  return { name, title, version, path: skillFile, invoke: `/${name}`, previousVersionSavedTo: backup ?? null, files: Object.keys(files ?? {}) }
}

/** The model-facing workflow_save tool definition, registered in the Host-wide tools registry (lib/index.js). */
export function workflowSaveTool() {
  return defineTool({
    name: 'workflow_save',
    description: 'Save or update a fixed workflow (the user\'s reusable SOP) as a DSH skill the user runs with /name. Use only when the user asks to save or change a fixed workflow, normally via the save-workflow skill. Overwrites the same name and keeps the previous version.',
    parameters: {
      name: { type: 'string', required: true, description: 'kebab-case ASCII, e.g. selinux-from-logs; becomes /selinux-from-logs.' },
      title: { type: 'string', required: true, description: 'Short display title in the user\'s language.' },
      description: { type: 'string', required: true, description: 'One line: what it does and when to use it.' },
      body: { type: 'string', required: true, description: 'Full SOP markdown: inputs, fixed ordered steps with exact commands, checks, prohibitions, deliverables.' },
      files: { type: 'object', additionalProperties: true, description: 'Optional helper files, e.g. {"scripts/parse.sh": "..."}; only scripts/, references/, assets/. Omit to keep existing files.' },
      modelInvocable: { type: 'boolean', description: 'Default false: only the user starts it with /name.' },
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args) { return saveWorkflow(args) },
  })
}
