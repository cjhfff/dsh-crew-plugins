/**
 * Install the Crew + Projects plugins into an existing DSH with its official `dsh plugin add` (packages are copied into the
 * profile, like any DSH plugin). Re-running is safe.
 *
 *   node install.mjs [--home <DSH_HOME>] [--dsh <path to @deepseek-ai/dsh/lib/bin.js>] [--profile web]
 *                    [--codex-home <dir>] [--no-codex-hooks] [--skills-dir <dir>] [--registry <url>]
 *
 * Defaults: DSH_HOME or ~/.dsh; the global npm install of @deepseek-ai/dsh; profile "web"; Codex home = CODEX_HOME or ~/.codex;
 * skills dir = ~/.agents/skills. Downloads a pinned pnpm (integrity-checked) into a temporary folder, so global tools are untouched.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const flag = name => args.includes(name)
const option = (name, fallback) => { const index = args.indexOf(name); return index === -1 ? fallback : args[index + 1] }
const fail = message => { console.error(`\n✗ ${message}`); process.exit(1) }
const ok = message => console.log(`  ✓ ${message}`)
const warn = message => console.log(`  ! ${message}`)
const isWindows = process.platform === 'win32'

// --- locate DSH
const npmRoot = () => { const result = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['root', '-g'], { encoding: 'utf8', shell: isWindows }); return result.status === 0 ? result.stdout.trim() : undefined }
const bin = path.resolve(option('--dsh', process.env.DSH_BIN || path.join(npmRoot() ?? '', '@deepseek-ai/dsh/lib/bin.js')))
if (!fs.existsSync(bin)) fail(`DSH not found at ${bin}. Install it first (npm i -g @deepseek-ai/dsh) or pass --dsh <.../@deepseek-ai/dsh/lib/bin.js>.`)
const dshVersion = JSON.parse(fs.readFileSync(path.join(path.dirname(bin), '../package.json'), 'utf8')).version
const home = path.resolve(option('--home', process.env.DSH_HOME || path.join(os.homedir(), '.dsh')))
const profile = option('--profile', 'web')
const registry = option('--registry', 'https://registry.npmjs.org')
const env = { ...process.env, DSH_HOME: home }
console.log(`DSH ${dshVersion}  home ${home}  profile ${profile}`)
const crewVersion = JSON.parse(fs.readFileSync(path.join(here, 'dsh-plugin-crew/package.json'), 'utf8')).version
const releases = path.join(here, 'releases')
const crewTarball = path.join(releases, `dsh-plugin-crew-${crewVersion}.tgz`), projectsTarball = path.join(releases, 'dsh-plugin-projects-0.1.1.tgz')
for (const file of [crewTarball, projectsTarball]) if (!fs.existsSync(file)) fail(`missing release ${file}`)

// --- profile
console.log('\n[1/4] profile')
const profileDir = path.join(home, 'profiles', profile)
if (!fs.existsSync(path.join(profileDir, 'package.json'))) {
  const result = spawnSync(process.execPath, [bin, '--profile', profile, '--dump-config'], { env, stdio: ['ignore', 'ignore', 'inherit'], windowsHide: true })
  if (result.status !== 0 || !fs.existsSync(path.join(profileDir, 'package.json'))) fail('could not initialize the DSH profile')
}
ok(profileDir)

// --- private pnpm + official plugin add
console.log('\n[2/4] plugins (official dsh plugin add)')
const temp = path.join(os.tmpdir(), `crew-install-${randomUUID()}`)
fs.mkdirSync(temp, { recursive: true })
try {
  const metadata = await (await fetch(`${registry.replace(/\/$/, '')}/pnpm/10.32.1`)).json()
  const archive = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer())
  if (metadata.dist.integrity !== `sha512-${createHash('sha512').update(archive).digest('base64')}`) fail('pnpm download integrity mismatch')
  fs.writeFileSync(path.join(temp, 'pnpm.tgz'), archive)
  // Windows' own bsdtar: a GNU tar earlier on PATH (Git Bash) reads "C:\..." as a remote host.
  const tar = isWindows ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
  if (spawnSync(tar, ['-xf', path.join(temp, 'pnpm.tgz'), '-C', temp], { windowsHide: true }).status !== 0) fail('could not unpack pnpm')
  const pnpm = path.join(temp, 'package/bin/pnpm.cjs')
  if (isWindows) fs.writeFileSync(path.join(temp, 'pnpm.cmd'), `@echo off\r\n"${process.execPath}" "${pnpm}" %*\r\n`)
  else fs.symlinkSync(pnpm, path.join(temp, 'pnpm'))
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
  env[pathKey] = `${temp}${path.delimiter}${env[pathKey] ?? ''}`
  const store = path.join(home, 'pnpm-store')
  const targets = [`@deepseek-ai/dsh-experimental-agent-team-profile@${dshVersion}`, `@deepseek-ai/dsh-subagent-codex@${dshVersion}`, projectsTarball, crewTarball]
  for (const target of targets) {
    console.log(`  … ${path.basename(target)}`)
    const result = spawnSync(process.execPath, [bin, 'plugin', '--profile', profile, 'add', target, '--store-dir', store, '--reporter=append-only',
      '--ignore-scripts', `--registry=${registry}`, '--fetch-retries=2', '--fetch-timeout=60000'], { env, stdio: 'inherit', windowsHide: true })
    if (result.status !== 0) fail(`dsh plugin add ${path.basename(target)} failed`)
    ok(path.basename(target))
  }
} finally { fs.rmSync(temp, { recursive: true, force: true }) }

// --- fixed workflows
console.log('\n[3/4] /save-workflow')
const skills = path.resolve(option('--skills-dir', path.join(os.homedir(), '.agents', 'skills')))
fs.mkdirSync(skills, { recursive: true })
fs.cpSync(path.join(here, 'dsh-plugin-crew/skills/save-workflow'), path.join(skills, 'save-workflow'), { recursive: true })
ok(`${skills}${path.sep}save-workflow`)

// --- Codex progress hooks (optional)
console.log('\n[4/4] Codex progress hooks')
if (flag('--no-codex-hooks')) warn('skipped (--no-codex-hooks)')
else {
  const codexHome = path.resolve(option('--codex-home', process.env.CODEX_HOME || path.join(os.homedir(), '.codex')))
  fs.mkdirSync(codexHome, { recursive: true })
  const installed = path.join(profileDir, 'node_modules/dsh-plugin-crew/codex/install-hooks.mjs')
  const result = spawnSync(process.execPath, [installed, codexHome], { env, stdio: 'inherit', windowsHide: true })
  result.status === 0 ? ok(`hooks trusted in ${codexHome}`) : warn('Codex hooks not installed (Codex cards will show results only); re-run later with --codex-home')
}

console.log(`\nDone. Restart DSH, then see README.md "配置" for keys and optional settings.`)
const gemini = path.join(process.env.APPDATA ?? '', 'npm/node_modules/@google/gemini-cli/bundle/gemini.js')
if (isWindows && !fs.existsSync(gemini)) warn('Gemini CLI not found: npm i -g @google/gemini-cli  (subagent_gemini needs it)')
if (!fs.existsSync(path.join(os.homedir(), '.grok/bin', isWindows ? 'grok.exe' : 'grok'))) warn('Grok CLI not found at ~/.grok/bin (subagent_grok needs it)')
