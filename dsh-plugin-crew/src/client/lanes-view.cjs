/** Crew lanes canvas: React Flow (xyflow, MIT) renders, dagre (MIT) assigns columns; data comes from lanes-model. */
const React = require('react')
const { ReactFlow, Background, Controls, Handle, Position, MarkerType, ReactFlowProvider, useReactFlow } = require('@xyflow/react')
const dagre = require('@dagrejs/dagre')
const flowCss = require('@xyflow/react/dist/base.css')

const h = React.createElement
const LABEL_W = 156, COL_W = 212, CARD_W = 184, CARD_H = 84, LANE_H = 116, PAD = 18
const STATE_LABEL = { running: '运行中', completed: '完成', failed: '失败', cancelled: '已取消', interrupted: '已中断', waiting: '等待回答', idle: '空闲', unknown: '未知', ready: '可开始', blocked: '等待依赖' }

const css = `
.dsh-crew-lanes{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font:12px/1.45 system-ui,sans-serif}
.dsh-crew-lanes-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}
.dsh-crew-lanes-head strong{font-size:13px}.dsh-crew-lanes-head .grow{flex:1}
.dsh-crew-lanes-meta{color:var(--dsw-alias-label-tertiary,#888);font-size:11px}
.dsh-crew-lanes-rework{color:var(--dsw-alias-state-error-primary,#d64545);font-weight:600}
.dsh-crew-lanes-canvas{flex:1;min-height:220px;position:relative}
.dsh-crew-lanes-empty{padding:28px 18px;color:var(--dsw-alias-label-tertiary,#888)}
.dsh-crew-lanes .react-flow{--xy-background-color:transparent;--xy-edge-stroke:var(--dsw-alias-label-tertiary,#9aa0a6);--xy-controls-button-background-color:var(--dsw-alias-bg-layer-1,#fff);--xy-controls-button-color:var(--dsw-alias-label-primary,#222);--xy-controls-button-border-color:var(--dsw-alias-border-l1,rgba(127,127,127,.25))}
.dsh-crew-lane{width:100%;height:100%;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.18));background:color-mix(in srgb,var(--lane,#888) 5%,transparent);pointer-events:none}
.dsh-crew-lane-label{position:absolute;left:0;top:0;bottom:0;width:${LABEL_W - 12}px;padding:12px;display:flex;flex-direction:column;gap:3px;border-right:1px solid color-mix(in srgb,var(--lane,#888) 22%,transparent)}
.dsh-crew-lane-label b{color:var(--lane,#888);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-crew-lane-label span{color:var(--dsw-alias-label-tertiary,#888);font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-crew-card{width:${CARD_W}px;height:${CARD_H}px;box-sizing:border-box;padding:8px 10px;border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid color-mix(in srgb,var(--lane,#888) 35%,var(--dsw-alias-border-l1,rgba(127,127,127,.25)));box-shadow:0 1px 2px rgba(0,0,0,.06);cursor:pointer;display:flex;flex-direction:column;gap:3px}
.dsh-crew-card.selected{outline:2px solid var(--lane,#888);outline-offset:1px}
.dsh-crew-card-top{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#888)}
.dsh-crew-card-title{font-size:12px;font-weight:600;line-height:1.3;max-height:2.6em;flex:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dsh-crew-card-meta{margin-top:auto;font-size:10.5px;color:var(--dsw-alias-label-tertiary,#888);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsh-crew-card .badge{margin-left:auto;padding:0 5px;border-radius:6px;font-size:10px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d64545) 14%,transparent);color:var(--dsw-alias-state-error-primary,#d64545)}
.dsh-crew-steps{display:flex;flex-direction:column;gap:4px}.dsh-crew-steps b{font-size:11.5px;font-weight:600}.dsh-crew-steps ol{margin:0;padding-left:4px;list-style:none;display:flex;flex-direction:column;gap:2px;font-size:11.5px}.dsh-crew-steps li{overflow-wrap:anywhere}.dsh-crew-steps .mark{display:inline-block;width:12px;text-align:center;color:var(--dsw-alias-label-tertiary,#888)}.dsh-crew-steps li[data-status=completed] .mark{color:var(--dsw-alias-state-success-primary,#339963)}.dsh-crew-steps li[data-status=failed] .mark{color:var(--dsw-alias-state-error-primary,#d64545)}.dsh-crew-steps li[data-status=in_progress] .mark{color:var(--dsw-alias-brand-primary,#4c6fff)}.dsh-crew-steps .path{color:var(--dsw-alias-label-tertiary,#888)}
.dsh-crew-card .warn{color:var(--dsw-alias-state-warn-primary,#c98a00)}
.dsh-crew-ldot{width:7px;height:7px;border-radius:50%;background:#9aa0a6;flex:none}
.dsh-crew-ldot.running{background:var(--dsw-alias-brand-primary,#4c6fff);animation:dshCrewPulse 1.4s ease-in-out infinite}.dsh-crew-ldot.completed{background:var(--dsw-alias-state-success-primary,#339963)}.dsh-crew-ldot.failed,.dsh-crew-ldot.interrupted{background:#d64545}.dsh-crew-ldot.ready{background:#9aa0a6}.dsh-crew-ldot.blocked,.dsh-crew-ldot.waiting{background:#e0a100}.dsh-crew-ldot.cancelled{background:#b0b0b0}
@keyframes dshCrewPulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.dsh-crew-ldot.running{animation:none}.dsh-crew-lanes .react-flow__edge.animated path{animation:none}}
.dsh-crew-lanes .react-flow__handle{opacity:0;width:1px;height:1px;min-width:0;min-height:0;border:0}
.dsh-crew-lanes-detail{max-height:38%;overflow:auto;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2));display:flex;flex-direction:column;gap:6px}
.dsh-crew-lanes-detail h4{margin:0;font-size:12.5px}.dsh-crew-lanes-detail pre{margin:0;white-space:pre-wrap;word-break:break-word;font:11.5px/1.5 ui-monospace,Consolas,monospace;color:var(--dsw-alias-label-tertiary,#666)}
.dsh-crew-lanes button.dsh-crew-lanes-btn{border:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.3));background:transparent;color:inherit;border-radius:7px;padding:3px 9px;font:inherit;cursor:pointer}
.dsh-crew-lanes button.dsh-crew-lanes-btn:focus-visible,.dsh-crew-card:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c6fff);outline-offset:2px}
`
const LANE_COLOR = { leader: '#7c5cff', teammate: '#2f80ed', 'in-process': '#0f9d8a', fork: '#0f9d8a', workflow: '#8e6bd8', codex: '#10a37f', gemini: '#4285f4', grok: '#e8590c', 'claude-code': '#c2683c', external: '#868e96', board: '#868e96' }

let styled = false
function ensureStyles() {
  if (styled || typeof document === 'undefined') return
  styled = true
  const style = document.createElement('style'); style.dataset.crewLanes = ''
  style.textContent = `${flowCss}\n${css}`; document.head.appendChild(style)
}
function formatTokens(value) {
  const n = typeof value === 'number' ? value : ['uncachedInputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'].reduce((sum, key) => sum + (Number(value?.[key]) || 0), 0)
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)
}

/** Columns from dagre over official edges plus per-lane chronology; rows fixed by lane. */
function layout(model) {
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({ rankdir: 'LR', nodesep: 10, ranksep: 28 })
  graph.setDefaultEdgeLabel(() => ({}))
  for (const card of model.cards) graph.setNode(card.id, { width: CARD_W, height: CARD_H })
  for (const edge of model.edges) graph.setEdge(edge.source, edge.target, {}, edge.id)
  for (const lane of model.lanes) for (let index = 1; index < lane.cards.length; index++) graph.setEdge(lane.cards[index - 1].id, lane.cards[index].id, {}, `order:${lane.cards[index].id}`)
  dagre.layout(graph)
  const xs = [...new Set(model.cards.map(card => Math.round(graph.node(card.id).x)))].sort((a, b) => a - b)
  const column = new Map(model.cards.map(card => [card.id, xs.indexOf(Math.round(graph.node(card.id).x))]))
  return { column, columns: Math.max(1, xs.length) }
}

function LaneNode({ data }) {
  return h('div', { className: 'dsh-crew-lane', style: { '--lane': data.color } },
    h('div', { className: 'dsh-crew-lane-label' }, h('b', { title: data.name }, data.name), data.detail ? h('span', { title: data.detail }, data.detail) : null,
      h('span', null, `${data.count} 项${data.running ? ` · ${data.running} 运行中` : ''}`)))
}
function CardNode({ data, selected }) {
  const card = data.card
  const steps = card.progress?.tools.length
  const meta = [card.elapsed && card.elapsed !== '—' ? card.elapsed : null, card.tokens ? `${formatTokens(card.tokens)} tok` : steps ? `${steps} 步` : card.external ? '外部执行' : null, card.workflow ? `Workflow · ${card.workflow}` : null].filter(Boolean).join(' · ')
  const current = card.state === 'running' ? currentStep(card.progress) : undefined
  return h('div', { className: `dsh-crew-card${selected ? ' selected' : ''}`, style: { '--lane': data.color }, tabIndex: 0, role: 'button', 'aria-label': `${card.title}，${STATE_LABEL[card.state] || card.state}`, 'data-card-id': card.id },
    h(Handle, { type: 'target', position: Position.Left, id: 'l' }), h(Handle, { type: 'source', position: Position.Right, id: 'r' }),
    h(Handle, { type: 'source', position: Position.Top, id: 'ts' }), h(Handle, { type: 'target', position: Position.Top, id: 'tt' }),
    h('div', { className: 'dsh-crew-card-top' }, h('span', { className: `dsh-crew-ldot ${card.state}` }), STATE_LABEL[card.state] || card.state,
      card.attempt > 1 ? h('span', { className: 'badge' }, `返工 · 第 ${card.attempt} 次`) : null),
    h('div', { className: 'dsh-crew-card-title', title: card.title }, card.title),
    h('div', { className: 'dsh-crew-card-meta', title: current || undefined }, card.warnings?.length ? h('span', { className: 'warn' }, `⚠ ${card.warnings.length} 写入重叠 · `) : null, current ? `▸ ${current}` : meta || ' '))
}
/** Title of the newest unfinished recorded step, else the newest step. */
function currentStep(progress) {
  const tools = progress?.tools || []
  return (tools.findLast(tool => tool.status !== 'completed' && tool.status !== 'failed') || tools.at(-1))?.title
}
const STEP_MARK = { completed: '✓', failed: '✗', in_progress: '…', pending: '·' }
/** Recorded ACP steps of an external Gemini/Grok run. */
function ProgressDetail({ progress }) {
  return h('div', { className: 'dsh-crew-steps' },
    progress.plan.length ? h('div', null, h('b', null, '计划'), h('ol', null, progress.plan.map((entry, index) => h('li', { key: index, 'data-status': entry.status }, `${STEP_MARK[entry.status] || '·'} ${entry.content}`)))) : null,
    h('b', null, `步骤（${progress.tools.length}）`),
    progress.tools.length ? h('ol', null, progress.tools.map(tool => h('li', { key: tool.id, 'data-status': tool.status, title: tool.paths?.join('\n') || undefined },
      h('span', { className: 'mark' }, STEP_MARK[tool.status] || '·'), ` ${tool.title}`, tool.paths?.length ? h('span', { className: 'path' }, ` · ${tool.paths[0].split(/[\\/]/).pop()}`) : null))) : h('div', { className: 'dsh-crew-lanes-meta' }, '还没有工具调用'),
    progress.message && !progress.endedAt ? h('pre', null, progress.message.slice(-1200)) : null)
}
const nodeTypes = { lane: LaneNode, card: CardNode }

function toFlow(model) {
  const { column, columns } = layout(model)
  const width = LABEL_W + columns * COL_W + PAD
  const nodes = [], laneIndex = new Map()
  model.lanes.forEach((lane, index) => {
    laneIndex.set(lane.id, index)
    nodes.push({ id: `lane:${lane.id}`, type: 'lane', position: { x: 0, y: index * LANE_H }, style: { width, height: LANE_H }, draggable: false, selectable: false, focusable: false, zIndex: -1,
      data: { name: lane.name, detail: lane.detail, count: lane.cards.length, running: lane.running, color: LANE_COLOR[lane.kind] || '#868e96' } })
  })
  for (const card of model.cards) {
    const lane = model.lanes[laneIndex.get(card.laneId)]
    nodes.push({ id: card.id, type: 'card', draggable: false, position: { x: LABEL_W + column.get(card.id) * COL_W, y: laneIndex.get(card.laneId) * LANE_H + (LANE_H - CARD_H) / 2 }, data: { card, color: LANE_COLOR[lane.kind] || '#868e96' } })
  }
  const edges = model.edges.filter(edge => edge.kind !== 'order').map(edge => edge.kind === 'rework'
    ? { id: edge.id, source: edge.source, target: edge.target, sourceHandle: 'ts', targetHandle: 'tt', type: 'default', label: '返工', animated: true,
        style: { stroke: '#d64545', strokeDasharray: '5 4', strokeWidth: 1.6 }, labelStyle: { fill: '#d64545', fontSize: 10.5, fontWeight: 600 }, labelBgStyle: { fillOpacity: 0 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#d64545' } }
    : { id: edge.id, source: edge.source, target: edge.target, sourceHandle: 'r', targetHandle: 'l', type: 'default',
        style: edge.kind === 'workflow' ? { strokeDasharray: '3 4' } : { strokeWidth: 1.4 }, markerEnd: { type: MarkerType.ArrowClosed } })
  return { nodes, edges, signature: `${model.lanes.map(l => l.id).join(',')}|${model.cards.map(c => c.id).join(',')}|${columns}` }
}

function Canvas({ model, selectedId, onSelect, dark }) {
  const flow = React.useMemo(() => toFlow(model), [model])
  const instance = useReactFlow()
  // Fit the width, then pin the first lane to the top instead of centering vertically.
  React.useEffect(() => { const timer = setTimeout(() => { instance.fitView({ padding: 0.04, maxZoom: 1 }).then?.(() => { const view = instance.getViewport(); instance.setViewport({ ...view, y: 12 }) }) }, 30); return () => clearTimeout(timer) }, [flow.signature])
  const nodes = React.useMemo(() => flow.nodes.map(node => node.id === selectedId ? { ...node, selected: true } : node), [flow, selectedId])
  return h(ReactFlow, { nodes, edges: flow.edges, nodeTypes, colorMode: dark ? 'dark' : 'light', nodesConnectable: false, nodesDraggable: false, elementsSelectable: true,
    minZoom: 0.3, maxZoom: 1.6, proOptions: { hideAttribution: true }, onNodeClick: (_, node) => node.type === 'card' && onSelect(node.id), onPaneClick: () => onSelect(undefined) },
    h(Background, { gap: 18, size: 1 }), h(Controls, { showInteractive: false, position: 'bottom-left' }))
}

function useDark() {
  const read = () => typeof document !== 'undefined' && (document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && !document.documentElement.classList.contains('light') && globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches))
  const [dark, setDark] = React.useState(read)
  React.useEffect(() => {
    const observer = new MutationObserver(() => setDark(read())); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)'), listen = () => setDark(read()); media?.addEventListener?.('change', listen)
    return () => { observer.disconnect(); media?.removeEventListener?.('change', listen) }
  }, [])
  return dark
}

/** @param {{model: ReturnType<import('./lanes-model.cjs')['buildLanes']>, onOpen?: (card: object) => void}} props */
function LanesView({ model, onOpen }) {
  ensureStyles()
  const [selectedId, setSelectedId] = React.useState()
  const dark = useDark()
  const selected = model.cards.find(card => card.id === selectedId)
  const executors = model.lanes.filter(lane => lane.kind !== 'leader' && lane.kind !== 'board').length
  return h('div', { className: 'dsh-crew-lanes' },
    h('div', { className: 'dsh-crew-lanes-head' }, h('strong', null, 'Crew 泳道'),
      h('span', { className: 'dsh-crew-lanes-meta' }, `${executors} 条执行泳道 · ${model.cards.length} 项`),
      model.reworkCount ? h('span', { className: 'dsh-crew-lanes-rework' }, `返工 ${model.reworkCount}`) : null, h('span', { className: 'grow' })),
    model.empty ? h('div', { className: 'dsh-crew-lanes-empty' }, 'Leader 直接完成，没有委派，也没有团队任务。')
      : h('div', { className: 'dsh-crew-lanes-canvas' }, h(ReactFlowProvider, null, h(Canvas, { model, selectedId, onSelect: setSelectedId, dark }))),
    selected ? h('div', { className: 'dsh-crew-lanes-detail', 'aria-live': 'polite' },
      h('h4', null, selected.title),
      h('div', { className: 'dsh-crew-lanes-meta' }, [STATE_LABEL[selected.state] || selected.state, selected.model, selected.elapsed, selected.tokens ? `${formatTokens(selected.tokens)} tok` : null, selected.task?.writeScopes?.length ? `写入：${selected.task.writeScopes.join(', ')}` : null].filter(Boolean).join(' · ')),
      selected.warnings?.length ? h('div', { className: 'dsh-crew-lanes-meta' }, selected.warnings.join('；')) : null,
      selected.error ? h('pre', null, String(selected.error)) : null,
      selected.progress ? h(ProgressDetail, { progress: selected.progress }) : null,
      selected.result ? h('pre', null, String(selected.result).slice(0, 4000)) : null,
      selected.openable && onOpen ? h('div', null, h('button', { type: 'button', className: 'dsh-crew-lanes-btn', onClick: () => onOpen(selected) }, '打开子会话')) : null) : null)
}

module.exports = { LanesView, layout, toFlow }
