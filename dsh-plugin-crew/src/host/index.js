/** Crew Host entry: external executor progress for the lanes view and the Host-wide workflow_save tool. */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { readRuns } from '../../acp-progress.mjs'
import { progressDirOf, registerExecutors } from './executors.js'
import { workflowSaveTool } from './workflows.js'
export { saveWorkflow, WORKFLOWS_DIR } from './workflows.js'

class CrewProgressService extends TypertRemoteService {
  static inject = ['typert']

  constructor(ctx, config = {}) {
    super(ctx, 'crewProgress', { namespace: 'crewProgress' })
    this.progressDir = progressDirOf(config)
  }

  /** Runs started at or after `since` (ms), oldest first, at most 100. */
  @Remote('list')
  async list(request) {
    return { runs: readRuns({ since: request.since, dir: this.progressDir }) }
  }
}

export const name = 'dsh-plugin-crew'
export const inject = CrewProgressService.inject
export { executorDefinitions } from './executors.js'
export function apply(ctx, config = {}) {
  ctx.plugin(CrewProgressService, config)
  registerExecutors(ctx, config)
  // Host-wide tools registry: every agent inherits workflow_save, whatever its preset.
  ctx.inject(['tools'], toolCtx => { toolCtx.tools.register(workflowSaveTool()) })
}
