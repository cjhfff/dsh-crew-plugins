/**
 * External ACP executors (Gemini, Grok) for the Crew Leader, mounted from the Host entry so launcher paths come from this
 * package's own location (works wherever `dsh plugin add` installs it). Each one is the official ACP provider plus an
 * official dsh-tool-subagent instance (`subagent_gemini`, `subagent_grok`). Settings come from the `crew-ui` entry config:
 *
 *   - id: crew-ui
 *     config:
 *       gemini: { enabled: true, model: gemini-2.5-flash, keyEnv: GEMINI_API_KEY, baseUrl: <optional OpenAI-style relay base>, entry: <gemini.js> }
 *       grok:   { enabled: true, keyEnv: XAI_API_KEY, home: <GROK_HOME source>, executable: <grok.exe> }
 *       progressDir: <dir>   # default <DSH_HOME>/crew-progress
 *
 * Credentials are read from the Host environment by name (keyEnv); only the variable names live in config.
 */
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as acp from '@deepseek-ai/dsh-subagent-acp'
import * as subagentTool from '@deepseek-ai/dsh-tool-subagent'

// lib/index.js → package root
export const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function progressDirOf(config = {}, env = process.env) {
  return config.progressDir || env.CREW_PROGRESS_DIR || (env.DSH_HOME ? path.join(env.DSH_HOME, 'crew-progress') : undefined)
}

const strings = values => Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'string' && value.length > 0))

/** Resolved executor definitions (pure; exported for tests). */
export function executorDefinitions(config = {}, env = process.env) {
  const progressDir = progressDirOf(config, env)
  const proxy = { NO_PROXY: env.NO_PROXY, no_proxy: env.no_proxy }
  const gemini = { enabled: true, model: 'gemini-2.5-flash', keyEnv: 'GEMINI_API_KEY', ...config.gemini }
  const grok = { enabled: true, keyEnv: 'XAI_API_KEY', ...config.grok }
  const common = { command: process.execPath, permission: 'allow', disposeEofGraceMs: 10000, disposeGraceMs: 3000 }
  return [
    gemini.enabled !== false && {
      provider: { ...common, providerName: 'gemini', args: [path.join(pluginRoot, 'gemini', 'launch.mjs')],
        env: strings({ CREW_GEMINI_API_KEY: env[gemini.keyEnv], CREW_GEMINI_MODEL: gemini.model, CREW_GEMINI_BASE_URL: gemini.baseUrl,
          CREW_GEMINI_ENTRY: gemini.entry || env.CREW_GEMINI_ENTRY, CREW_PROGRESS_DIR: progressDir, ...proxy }) },
      tool: { provider: 'gemini', toolName: 'subagent_gemini', maxDepth: 'provider-managed' },
    },
    grok.enabled !== false && {
      provider: { ...common, providerName: 'grok', args: [path.join(pluginRoot, 'grok', 'launch.mjs')],
        env: strings({ [grok.keyEnv]: env[grok.keyEnv], CREW_GROK_SOURCE_HOME: grok.home || env.CREW_GROK_SOURCE_HOME || path.join(pluginRoot, 'grok', 'home'),
          CREW_GROK_EXECUTABLE: grok.executable || env.CREW_GROK_EXECUTABLE || path.join(os.homedir(), '.grok', 'bin', 'grok.exe'),
          CREW_PROGRESS_DIR: progressDir, ...proxy }) },
      tool: { provider: 'grok', toolName: 'subagent_grok', maxDepth: 'provider-managed' },
    },
  ].filter(Boolean)
}

/** Mount the official ACP provider and tool plugins for each enabled executor. */
export function registerExecutors(ctx, config = {}) {
  for (const { provider, tool } of executorDefinitions(config)) {
    ctx.plugin(acp, provider)
    ctx.plugin(subagentTool, tool)
  }
}
