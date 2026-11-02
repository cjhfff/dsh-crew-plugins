/**
 * Deterministic Crew artifacts; no runtime/source modifications.
 * - lib/client.js: esbuild bundles src/client (React Flow + dagre, both MIT, plus the Remote contract) into one ModuleLoader
 *   factory. React, React DOM and other @deepseek-ai packages stay external and resolve through the DSH ModuleLoader.
 * - lib/index.js: Host entry (progress Remote). The typert protocol is imported from the nominated runtime by relative
 *   path, like dsh-plugin-context-guard, because this package is linked and must share the runtime's module instance.
 * - lib/typert.remote-client.js: Remote descriptors for the official typert loader (lib/typert.host.js).
 * The pinned toolchain lives outside this linked package: overlay/build/crew-client.
 * Options: --check, --source <client entry>, --target <client output>, --out <package root for lib/>.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const toolchain = path.resolve(here, '../build/crew-client')
// DSH packages used at build time (zod, typert remote-info): DSH_RUNTIME_MODULES, else this harness checkout's runtime.
const runtimeModules = process.env.DSH_RUNTIME_MODULES || path.resolve(here, '../../../runtime/node_modules')
let esbuild
try { esbuild = createRequire(path.join(toolchain, 'package.json'))('esbuild') }
catch { throw new Error('Crew build toolchain is missing; run `npm ci` in build/crew-client') }

const arg = name => { const index = process.argv.indexOf(name); return index === -1 ? undefined : process.argv[index + 1] }
const outRoot = arg('--out') ?? here
const clientTarget = arg('--target') ?? path.join(outRoot, 'lib/client.js')
const clientSource = arg('--source') ?? path.join(here, 'src/client/index.js')
const common = { absWorkingDir: here, bundle: true, write: false, charset: 'utf8', logLevel: 'silent', target: 'es2022', legalComments: 'eof', nodePaths: [path.join(toolchain, 'node_modules'), runtimeModules] }
const REMOTE_INFO = '@deepseek-ai/dsh-typert-protocol/remote-info'
const remoteInfoPath = createRequire(path.join(runtimeModules, '@deepseek-ai/dsh-typert-protocol/package.json')).resolve(REMOTE_INFO)
// Bundle the contract helper (it needs no runtime imports); every other @deepseek-ai import stays external.
const bundleRemoteInfo = { name: 'crew-remote-info', setup(build) { build.onResolve({ filter: /^@deepseek-ai\/dsh-typert-protocol\/remote-info$/ }, () => ({ path: remoteInfoPath })) } }

const client = await esbuild.build({
  ...common, entryPoints: [clientSource], format: 'cjs', platform: 'browser', minify: true,
  external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/*'],
  plugins: [bundleRemoteInfo], loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
})
const remoteClient = await esbuild.build({ ...common, entryPoints: [path.join(here, 'src/remote.js')], format: 'esm', platform: 'neutral', plugins: [bundleRemoteInfo] })
const hostTarget = path.join(outRoot, 'lib/index.js')
// Host entry lib/index.js: progress Remote, ACP executors and the Host-wide workflow_save tool.
// @deepseek-ai imports stay bare: DSH's profile package routing resolves them to the running runtime (one shared instance).
const host = await esbuild.build({ ...common, entryPoints: [path.join(here, 'src/host/index.js')], format: 'esm', platform: 'node', external: ['@deepseek-ai/*'] })

const outputs = [
  [clientTarget, `window.__ModuleLoader__.load({id:"dsh-plugin-crew",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${client.outputFiles[0].text}\nreturn module.exports;}});\n`],
  [path.join(outRoot, 'lib/typert.remote-client.js'), remoteClient.outputFiles[0].text],
  [hostTarget, host.outputFiles[0].text],
]
if (process.argv.includes('--check')) {
  for (const [file, text] of outputs) if (await readFile(file, 'utf8').catch(() => '') !== text) throw new Error(`Crew artifact is stale: ${path.relative(outRoot, file)}; run node build.mjs`)
} else for (const [file, text] of outputs) await writeFile(file, text, 'utf8')
