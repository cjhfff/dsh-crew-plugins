/** Strict Remote contract shared by the Crew Host and the Web client (same shape as dsh-plugin-projects). */
import { z } from 'zod'
import { createTypertRemoteInfo } from '@deepseek-ai/dsh-typert-protocol/remote-info'

const listRequest = z.strictObject({ since: z.number().int().min(0) })
const codec = { mode: 'strict', typeSymbol: 'dsh-plugin-crew#progress-list:request', create: () => listRequest, jsonSchema: z.toJSONSchema(listRequest, { target: 'draft-7' }) }
const methods = {
  'crewProgress/list': {
    service: 'crewProgress',
    description: 'List recorded progress of external ACP executor runs (Gemini, Grok) started at or after a time.',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', source: 'json', codec, strictCodec: codec }],
    result: { mode: 'strict', typeSymbol: 'dsh-plugin-crew#progress-list:result', create: () => z.json() },
  },
}

/** Mount with `ctx.remote.$mount(TYPERT_REMOTE)` before using `remote.crewProgress`. */
export const TYPERT_REMOTE = createTypertRemoteInfo({ package: 'dsh-plugin-crew', methods }, z)
export default TYPERT_REMOTE
