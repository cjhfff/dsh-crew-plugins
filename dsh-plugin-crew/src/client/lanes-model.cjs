/**
 * Crew lanes model: a pure fold of official public data into swimlanes.
 *
 * Sources (no inference from timing or wording):
 * - Agent Teams `agentTeam` projection: members, tasks, `blockedBy`, owner, write-scope warnings.
 * - Subagent catalog rows folded by `buildCrewSnapshot` (state, timing, external tool name).
 * - Persisted `workflow-run` Chat nodes: phase order of workflow members.
 * Explicit link: a delegation whose label starts with a Team task id (`task-3 ...`) executes that task.
 * Rework: a task executed by more than one delegation; each later attempt is a rework of the previous one.
 */
const EXECUTORS = {
  subagent_codex: { id: 'codex', name: 'Codex' },
  subagent_gemini: { id: 'gemini', name: 'Gemini' },
  subagent_grok: { id: 'grok', name: 'Grok' },
  subagent_claude_code: { id: 'claude-code', name: 'Claude Code' },
  subagent_fork: { id: 'fork', name: 'Fork' },
  subagent: { id: 'in-process', name: '进程内子 agent' },
}
const LANE_ORDER = ['leader', 'teammate', 'in-process', 'fork', 'workflow', 'codex', 'gemini', 'grok', 'claude-code', 'external', 'board']
const TASK_ID = /^\s*\[?(task-\d+)\]?(?=[\s:：,，.。\-—]|$)/i

const PROGRESS_PROVIDERS = { gemini: 'gemini', grok: 'grok', codex: 'codex' }
const normalize = text => String(text || '').replace(/\s+/g, ' ').trim()

/**
 * Pair external Gemini/Grok/Codex cards with runs recorded by the Crew ACP launchers or the Codex progress hook. A run matches only when its provider is
 * the card's executor and its recorded ACP prompt contains the delegation prompt from the Leader's tool call; among
 * matches the run starting closest to the card is chosen, and each run is used once.
 * @param {object[]} cards - lane cards (external runs carry laneId and childId).
 * @param {object[]} runs - recorded runs ({id, provider, startedAt, prompt, ...}).
 * @param {Map<string,string>} prompts - child id → delegation prompt.
 * @returns {Map<string, object>} child id → run.
 */
function matchProgress(cards, runs, prompts) {
  const used = new Set(), matched = new Map()
  for (const card of [...cards].sort((a, b) => a.createdAt - b.createdAt)) {
    const provider = PROGRESS_PROVIDERS[card.laneId]
    const head = normalize(prompts.get(card.childId)).slice(0, 160)
    if (!provider || !head || card.kind !== 'run') continue
    let best
    for (const run of runs) {
      if (used.has(run.id) || run.provider !== provider || !normalize(run.prompt).includes(head)) continue
      const lag = run.startedAt - card.createdAt
      if (lag < -30000 || lag > 600000) continue
      if (!best || Math.abs(lag) < Math.abs(best.startedAt - card.createdAt)) best = run
    }
    if (best) { used.add(best.id); matched.set(card.childId, best) }
  }
  return matched
}

const formatElapsed = ms => { const sec = Math.max(0, Math.round(ms / 1000)); return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s` }

function taskIdOf(label) { const match = String(label || '').match(TASK_ID); return match ? match[1].toLowerCase() : undefined }

function laneFor(row, team, workflowMembers) {
  const id = String(row.entry.id)
  const member = team.members.find(item => String(item.id) === id && item.role === 'teammate')
  if (member) return { id: `teammate:${member.name}`, kind: 'teammate', name: member.name, detail: member.description || '' }
  if (workflowMembers.has(id)) return { id: 'workflow', kind: 'workflow', name: 'Workflow', detail: '' }
  const executor = EXECUTORS[row.toolName]
  if (executor) return { id: executor.id, kind: executor.id, name: executor.name, detail: row.modelLabel || '' }
  if (row.entry.mode === 'external') return { id: 'external', kind: 'external', name: '外部执行', detail: row.modelLabel || '' }
  return { id: 'in-process', kind: 'in-process', name: EXECUTORS.subagent.name, detail: row.modelLabel || '' }
}

/**
 * @param {object} input
 * @param {object} input.snapshot - result of buildCrewSnapshot (rows, leader).
 * @param {object[]} [input.nodes] - Chat nodes of the Lead Session.
 * @param {object} [input.team] - Lead Session `agentTeam` projection value.
 * @param {Map<string,string>} [input.toolNames] - child id → delegation tool name.
 * @param {Map<string,string>} [input.results] - child id → final result text.
 * @returns {{lanes:object[], cards:object[], edges:object[], reworkCount:number, empty:boolean}}
 */
function buildLanes({ snapshot = {}, nodes = [], team, toolNames = new Map(), results = new Map(), leadSessionId, runs = [], prompts = new Map(), now = Date.now() } = {}) {
  const board = { members: team?.members || [], tasks: (team?.tasks || []).filter(task => task.status !== 'deleted') }
  const workflowMembers = new Map(), workflowPhases = []
  for (const node of nodes) {
    if (node.kind !== 'workflow-run') continue
    const run = node.data || {}, phases = []
    for (const phase of run.phases || []) phases.push((phase.members || []).map(member => { workflowMembers.set(String(member.childId), run.name || 'Workflow'); return String(member.childId) }))
    workflowPhases.push(phases)
  }
  const lanes = new Map(), cards = [], edges = []
  const addLane = lane => { if (!lanes.has(lane.id)) lanes.set(lane.id, { ...lane, cards: [], running: 0 }); return lanes.get(lane.id) }
  addLane({ id: 'leader', kind: 'leader', name: 'Leader', detail: snapshot.leader?.model || '' })
  for (const member of board.members) if (member.role === 'teammate') addLane({ id: `teammate:${member.name}`, kind: 'teammate', name: member.name, detail: member.description || '' })

  const attemptsByTask = new Map(), memberRows = new Map()
  const rows = [...(snapshot.rows || [])].sort((a, b) => (Number(a.entry.createdAt) || 0) - (Number(b.entry.createdAt) || 0))
  for (const source of rows) {
    const id = String(source.entry.id), row = { ...source, toolName: toolNames.get(id) || source.toolName }
    // A teammate is a lane, not a card: its owned tasks become its cards and open its session.
    const member = board.members.find(item => String(item.id) === id && item.role === 'teammate')
    if (member) { memberRows.set(member.name, row); if (row.running) addLane(laneFor(row, board, workflowMembers)).running++; continue }
    const lane = addLane(laneFor(row, board, workflowMembers))
    const taskId = taskIdOf(row.entry.label)
    const task = taskId ? board.tasks.find(item => String(item.id).toLowerCase() === taskId) : undefined
    const card = {
      id: `run:${id}`, childId: id, laneId: lane.id, kind: 'run', title: row.name, taskId: task ? String(task.id) : undefined,
      state: row.state, elapsed: row.elapsed, tokens: row.usageKnown ? row.v?.tokenUsage : undefined,
      external: row.entry.mode === 'external', openable: row.entry.mode !== 'external', model: row.modelLabel,
      mode: row.entry.mode, parentId: row.parentId === undefined ? undefined : String(row.parentId),
      createdAt: Number(row.entry.createdAt) || 0, result: results.get(id) || row.activityNote || '', error: row.error,
      workflow: workflowMembers.get(id),
    }
    if (task) { const list = attemptsByTask.get(String(task.id)) || []; card.attempt = list.length + 1; list.push(card); attemptsByTask.set(String(task.id), list) }
    lane.cards.push(card); cards.push(card); if (row.running) lane.running++
  }

  // Team tasks without a linked delegation are their own cards in the owner's lane (or the unclaimed board lane).
  const memberLane = name => name === 'lead' ? 'leader' : lanes.has(`teammate:${name}`) ? `teammate:${name}` : undefined
  const memberOf = name => board.members.find(item => item.role === 'teammate' && item.name === name)
  for (const task of board.tasks) {
    const linked = attemptsByTask.get(String(task.id))
    if (linked) { for (const card of linked) Object.assign(card, { task, title: `${task.id} · ${task.subject}`, warnings: task.writeScopeWarnings || [] }); continue }
    const laneId = memberLane(task.ownerName) || addLane({ id: 'board', kind: 'board', name: '任务板 · 待认领', detail: '' }).id
    const card = {
      id: `task:${task.id}`, laneId, kind: 'task', task, taskId: String(task.id), title: `${task.id} · ${task.subject}`,
      state: task.status === 'completed' ? 'completed' : task.status === 'in_progress' ? 'running' : task.ready ? 'ready' : 'blocked',
      openable: false, external: false, result: task.description, warnings: task.writeScopeWarnings || [], createdAt: Number.MAX_SAFE_INTEGER,
    }
    const owner = memberOf(task.ownerName)
    if (owner) Object.assign(card, { childId: String(owner.id), parentId: leadSessionId, mode: 'continuable', openable: Boolean(leadSessionId), model: memberRows.get(owner.name)?.modelLabel,
      elapsed: memberRows.get(owner.name)?.elapsed, tokens: memberRows.get(owner.name)?.usageKnown ? memberRows.get(owner.name).v?.tokenUsage : undefined })
    lanes.get(laneId).cards.push(card); cards.push(card)
    if (card.state === 'running' && !owner) lanes.get(laneId).running++
  }
  // A teammate without board work still shows its own session as one card.
  for (const [name, row] of memberRows) {
    const lane = lanes.get(`teammate:${name}`)
    if (!lane || lane.cards.length) continue
    const card = { id: `run:${row.entry.id}`, childId: String(row.entry.id), laneId: lane.id, kind: 'run', title: row.name, state: row.state, elapsed: row.elapsed,
      tokens: row.usageKnown ? row.v?.tokenUsage : undefined, external: false, openable: true, mode: row.entry.mode, parentId: row.parentId === undefined ? leadSessionId : String(row.parentId),
      model: row.modelLabel, createdAt: Number(row.entry.createdAt) || 0, result: '', error: row.error }
    lane.cards.push(card); cards.push(card)
  }

  // Official dependencies: Team blockedBy (last attempt of blocker → first attempt of dependent) and workflow phase order.
  const firstOf = taskId => (attemptsByTask.get(taskId) || [cards.find(card => card.id === `task:${taskId}`)]).filter(Boolean)[0]
  const lastOf = taskId => (attemptsByTask.get(taskId) || [cards.find(card => card.id === `task:${taskId}`)]).filter(Boolean).at(-1)
  // The blocker edge leaves the latest blocker attempt that started before the dependent did (a later rework is not what it waited for).
  const blockerFor = (blocker, to) => (attemptsByTask.get(blocker) || []).filter(card => card.createdAt <= to.createdAt).at(-1) || lastOf(blocker)
  for (const task of board.tasks) for (const blocker of task.blockedBy || []) {
    const to = firstOf(String(task.id)), from = to && blockerFor(String(blocker), to)
    if (from && to) edges.push({ id: `dep:${from.id}->${to.id}`, source: from.id, target: to.id, kind: 'dependency' })
  }
  for (const phases of workflowPhases) for (let index = 1; index < phases.length; index++) for (const from of phases[index - 1]) for (const to of phases[index]) {
    if (cards.some(card => card.childId === from) && cards.some(card => card.childId === to)) edges.push({ id: `wf:${from}->${to}`, source: `run:${from}`, target: `run:${to}`, kind: 'workflow' })
  }
  let reworkCount = 0
  for (const attempts of attemptsByTask.values()) for (let index = 1; index < attempts.length; index++) {
    reworkCount++
    edges.push({ id: `rework:${attempts[index - 1].id}->${attempts[index].id}`, source: attempts[index - 1].id, target: attempts[index].id, kind: 'rework' })
    // Layout only (never drawn): work started between two attempts is placed before the rework.
    for (const card of cards) if (card.kind === 'run' && card.taskId !== attempts[index].taskId && card.createdAt > attempts[index - 1].createdAt && card.createdAt < attempts[index].createdAt)
      edges.push({ id: `order:${card.id}->${attempts[index].id}`, source: card.id, target: attempts[index].id, kind: 'order' })
  }
  for (const [childId, run] of matchProgress(cards, runs, prompts)) {
    const card = cards.find(item => item.childId === childId && item.kind === 'run')
    card.progress = { tools: run.tools || [], plan: run.plan || [], message: run.message || '', stopReason: run.stopReason, endedAt: run.endedAt, exitCode: run.exitCode, updatedAt: run.updatedAt }
    // DSH publishes no live state for external runs; an open recording means the CLI process is still working.
    if (card.state === 'unknown' && !run.endedAt) { card.state = 'running'; lanes.get(card.laneId).running++ }
    if (card.elapsed === '—' || !card.elapsed) card.elapsed = formatElapsed((run.endedAt || now) - run.startedAt)
    if (!results.has(childId)) card.result = ''
  }
  for (const lane of lanes.values()) lane.cards.sort((a, b) => a.createdAt - b.createdAt)
  if (!lanes.get('leader').cards.length) lanes.delete('leader')
  const ordered = [...lanes.values()].sort((a, b) => LANE_ORDER.indexOf(a.kind) - LANE_ORDER.indexOf(b.kind))
  return { lanes: ordered, cards, edges, reworkCount, empty: cards.length === 0 }
}

module.exports = { buildLanes, taskIdOf, matchProgress, EXECUTORS }
