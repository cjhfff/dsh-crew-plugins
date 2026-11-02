/** Crew browser entry. Only public Session projections, lifecycle and Conversation views. */
const React = require('react')
const { createPortal } = require('react-dom')
const { useAnchoredPosition } = require('@deepseek-ai/dsh-client-ui-primitives')
const { buildLanes } = require('./lanes-model.cjs')
const crewRemote = require('../remote.js').default
const inject = ['slots', 'sessions', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace', 'remote']
const LANES_ID = 'dsh-plugin-crew/lanes', LANES_KIND = 'crewLanes'
const h = React.createElement
const css = `
.dsh-crew-root{display:inline-flex;align-items:center;color:var(--dsw-alias-label-primary);font:12px/1.45 system-ui,sans-serif}
.dsh-crew-trigger,.dsh-crew-close,.dsh-crew-refresh{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:28px;border:0;border-radius:var(--dsw-radius-sm,7px);padding:4px 8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.dsh-crew-trigger:hover,.dsh-crew-close:hover,.dsh-crew-refresh:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-crew-trigger:focus-visible,.dsh-crew-close:focus-visible,.dsh-crew-refresh:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-crew-dot{display:inline-block;flex:none;width:7px;height:7px;margin-top:5px;border-radius:50%;background:var(--dsw-alias-state-idle-primary,#87909c)}
.dsh-crew-trigger>.dsh-crew-dot{margin-top:0}.dsh-crew-dot.running{background:var(--dsw-alias-state-success-primary,#339963);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-success-primary,#339963) 16%,transparent)}
.dsh-crew-dot.completed{background:var(--dsw-alias-state-success-primary,#339963)}.dsh-crew-dot.failed{background:var(--dsw-alias-state-error-primary,#d94c4c)}.dsh-crew-dot.cancelled,.dsh-crew-dot.interrupted,.dsh-crew-dot.waiting{background:var(--dsw-alias-state-warn-primary,#c48c2c)}
.dsh-crew-panel{position:fixed;z-index:110;box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:min(760px,calc(100vh - 40px));overflow:auto;border:0;border-radius:var(--dsw-radius-lg,14px);padding:16px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#202124);box-shadow:var(--dsw-elevation-prominent,0 14px 40px #0003);font:12px/1.5 system-ui,sans-serif}
.dsh-crew-head,.dsh-crew-title,.dsh-crew-rowhead{display:flex;align-items:center;gap:8px}.dsh-crew-head{justify-content:space-between}.dsh-crew-title h3{margin:0;font-size:14px;font-weight:600}.dsh-crew-head .dsh-crew-dot{margin:0}.dsh-crew-close{width:28px;padding:0;font-size:19px}.dsh-crew-muted,.dsh-crew-meta{color:var(--dsw-alias-label-tertiary,#737b87)}
.dsh-crew-meta{font-size:11px;overflow-wrap:anywhere}.dsh-crew-leader{margin-top:12px;padding:11px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f4f5f7)}.dsh-crew-leader .dsh-crew-meta{margin-top:3px}.dsh-crew-action{margin-top:6px;overflow-wrap:anywhere;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dsh-crew-section{margin-top:16px}.dsh-crew-section>h4{margin:0 0 7px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-tertiary,#737b87)}.dsh-crew-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:8px;align-items:start;padding:9px 0;border-top:.5px solid var(--dsw-alias-border-l1,#ddd)}.dsh-crew-row:first-of-type{border-top:0}.dsh-crew-name{font-weight:500;overflow-wrap:anywhere}.dsh-crew-state{font-size:10px;border-radius:99px;padding:2px 7px;background:var(--dsw-alias-bg-layer-2,#f4f5f7);white-space:nowrap}.dsh-crew-row[data-state=failed] .dsh-crew-state{color:var(--dsw-alias-state-error-primary)}
.dsh-crew-relation{padding:4px 0 4px 10px;border-left:.5px solid var(--dsw-alias-border-l2,#ddd);margin-left:3px;overflow-wrap:anywhere}.dsh-crew-workflow{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f4f5f7);margin-top:7px}.dsh-crew-workflow strong{font-size:12px;font-weight:500}.dsh-crew-progress{height:4px;border-radius:99px;margin-top:7px;background:var(--dsw-alias-border-l1,#ddd);overflow:hidden}.dsh-crew-progress>i{display:block;height:100%;background:var(--dsw-alias-brand-primary,#4c6fff);transition:width .2s}
.dsh-crew-skills{display:flex;flex-wrap:wrap;gap:5px}.dsh-crew-skill{font-size:10px;padding:3px 7px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,#f4f5f7);overflow-wrap:anywhere}.dsh-crew-skill.used{color:var(--dsw-alias-brand-primary)}.dsh-crew-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;padding-top:10px;border-top:.5px solid var(--dsw-alias-border-l1,#ddd)}
`
if (typeof document !== 'undefined' && !document.querySelector('style[data-dsh-crew]')) {
  const style = document.createElement('style'); style.dataset.dshCrew = ''; style.textContent = css; document.head.appendChild(style)
}
const labels = { running:'运行中', completed:'完成', failed:'失败', cancelled:'已取消', interrupted:'已中断', waiting:'等待交互', idle:'空闲', unknown:'状态未知' }
function sum(v) { return ['uncachedInputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'].reduce((n,k)=>n+(Number(v?.[k])||0),0) }
function tokens(value) { const n=typeof value==='number'?value:sum(value); return n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:String(n) }
function duration(t,running,now=Date.now()) {
  if (!t) return '—'
  let ms=Number(t.settledMs)||0
  if (t.active) { const end=running?now:Number(t.active.through)||Number(t.active.since)||now; ms+=Math.max(0,end-(Number(t.active.since)||end)) }
  const seconds=Math.floor(ms/1000)
  return seconds<1?'<1s':seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`
}
function model(v) { const route=v?.modelSelection?.lastUsed||v?.modelSelection?.next; return route?`${route.provider} / ${route.model}`:'等待模型信息' }
function textParts(parts) { return (parts||[]).filter(p=>p.type==='text'||p.kind==='text').map(p=>p.text||'').join(' ') }
function nodesOf(conversation) { return Array.from(conversation?.views?.get?.('chat')?.nodes?.values?.()||[]) }
function ordered(nodes) { return [...nodes].sort((a,b)=>(a.anchorSeq??a.data?.seq??0)-(b.anchorSeq??b.data?.seq??0)) }
function latestAction(nodes,running) {
  for (const node of ordered(nodes).reverse()) {
    if (node.kind==='turn-error') return node.data?.message||'请求失败'
    if (node.kind==='tool-call') {
      const tool=node.data?.root
      if (tool) return `${tool.kind==='tool-result'?(tool.isError?'工具失败':'已完成'):'正在执行'} · ${tool.name||'工具'}`
    }
    if (node.kind==='assistant-step') { const text=textParts(node.data?.blocks).replace(/\s+/g,' ').trim(); if(text)return text.slice(0,180) }
    if (node.kind==='user') return running?'已收到请求，正在处理':'请求已收到'
  }
  return running?'正在处理当前请求':'等待下一步'
}
function skillNames(nodes) {
  const used=new Set(), visit=tool=>{
    if (!tool) return
    if (tool.name==='skill') {
      try { const args=JSON.parse(tool.argsRaw||tool.call?.argsRaw||'{}'); if(typeof args.name==='string')used.add(args.name) } catch {}
    }
    for(const child of tool.subCalls||[])visit(child)
  }
  for(const node of nodes) {
    if(node.kind==='tool-call')visit(node.data?.root)
    if(node.kind==='assistant-step')for(const b of node.data?.blocks||[])if(b.kind==='tool-call')visit(b)
  }
  return [...used]
}
function recommendSkills(text) {
  const result=['bmad-build','verification-before-completion']
  const add=(re,skills)=>{if(re.test(text))result.push(...skills)}
  add(/页面|界面|前端|交互|html|css|ui|网页|好看/i,['frontend-design','headless-ui-check'])
  add(/算法|状态|协议|bug|错误|调试/i,['systematic-debugging','test-driven-development'])
  add(/导入|导出|存储|数据|csv|json|记账/i,['test-driven-development','bmad-review'])
  add(/安全|认证|密钥|auth|key/i,['security-best-practices'])
  add(/部署|容器|docker/i,['docker-development','monitoring-expert'])
  add(/测试|test/i,['test-master']); add(/性能|performance/i,['performance-profiler']); add(/文档|docs/i,['code-documenter'])
  return [...new Set(result)].slice(0,6)
}
/** External providers have no local child Session. Correlate only the public
 * tool renderer's exact activation acknowledgement and runtime-owned notice.
 * Source: tool-subagent/src/index.ts and subagent/src/continuation-messages.ts. */
function externalActivity(nodes) {
  const activity=new Map()
  const visit=tool=>{
    if(!tool)return
    if(tool.kind==='tool-result'&&!tool.isError) {
      const match=textParts(tool.content).trim().match(/^started subagent (\S+)$/)
      // The Leader's delegation prompt lets the lanes view pair this child with its recorded ACP run.
      let args={};try{args=JSON.parse(tool.call?.argsRaw||'{}')}catch{}
      if(match)activity.set(match[1],{...activity.get(match[1]),toolName:tool.name,accepted:true,prompt:typeof args.prompt==='string'?args.prompt:undefined})
    }
    for(const child of tool.subCalls||[])visit(child)
  }
  for(const node of ordered(nodes)) {
    if(node.kind==='tool-call')visit(node.data?.root)
    const source=node.data?.source
    if(source?.kind!=='subagent-settled'||typeof source.senderSessionId!=='string')continue
    const id=source.senderSessionId,summary=String(source.summary||''),subject=`Background subagent ${id} `
    let state='unknown'
    if(summary===`${subject}finished. It cannot receive follow-up messages.`||summary===`${subject}finished and will do no further work unless you send it more.`)state='completed'
    else if(summary===`${subject}was stopped before it finished.`)state='cancelled'
    else if(summary===`${subject}failed before it finished.`||summary===`${subject}ran out of room before it finished.`||summary===`${subject}declined the task.`||summary.startsWith(`${subject}ended abnormally (`))state='failed'
    activity.set(id,{...activity.get(id),state,endedAt:Number(node.data?.time)||undefined,summary})
  }
  return activity
}
/** Final text of each official `subagent-settled` notice, keyed by child id. */
function settledResults(nodes) {
  const results=new Map()
  for(const node of ordered(nodes)) {
    const source=node.data?.source
    if(source?.kind==='subagent-settled'&&typeof source.senderSessionId==='string')results.set(source.senderSessionId,textParts(node.data?.content).trim()||String(source.summary||''))
  }
  return results
}
function configuredExternalModel(toolName) {
  // This deployment's configured executor, not provider-reported actual usage.
  return toolName==='subagent_codex'?'配置：Codex / gpt-6.1-sol':toolName==='subagent_claude_code'?'配置：Claude Code':toolName?`外部执行 · ${toolName}`:'外部执行 · 模型未公开'
}
/** Fold public projection/catalog/Chat values; identity edges retain their real parent. */
function buildCrewSnapshot({sessionId,sessions={},statuses=new Map(),nodes=[],leaderSnapshot={},childErrors={},now=Date.now()}) {
  const projections=sessions.projectionsBySession||{},byId=sessions.byId||{},parent=projections[sessionId]?.values||byId[sessionId]?.projectionValues||{}
  const workflows=ordered(nodes).filter(n=>n.kind==='workflow-run'),memberState=new Map()
  for(const node of workflows)for(const phase of node.data?.phases||[])for(const member of phase.members||[])memberState.set(String(member.childId),member.status)
  const leaderRunning=Boolean(statuses.get(sessionId)?.running??byId[sessionId]?.running??leaderSnapshot.running)
  const external=externalActivity(nodes),rows=[],seen=new Set([String(sessionId)]),refreshIds=[sessionId]
  function walk(parentId,parentName,depth) {
    const values=projections[parentId]?.values||byId[parentId]?.projectionValues||{}
    for(const entry of values.subagentCatalog||[]) {
      const id=String(entry.id); if(seen.has(id))continue; seen.add(id)
      if(entry.mode!=='external')refreshIds.push(entry.id)
      const summary=byId[entry.id]||{},v=projections[entry.id]?.values||summary.projectionValues||{},status=statuses.get(entry.id),workflowStatus=memberState.get(id),outside=entry.mode==='external',execution=external.get(id)
      const parentRunning=Boolean(statuses.get(parentId)?.running??byId[parentId]?.running??leaderRunning)
      const running=outside?Boolean(!execution?.state&&((execution?.accepted&&parentRunning)||workflowStatus==='running')):Boolean(status?.running??summary.running)
      const error=childErrors[id]
      const state=running?'running':execution?.state|| (status?.pendingInteraction?'waiting':error?'failed':['failed','cancelled','interrupted'].includes(workflowStatus)?workflowStatus:workflowStatus==='completed'||v.subagentTiming?.lastTurnCompleted===true?'completed':outside||v.subagentTiming?'unknown':'idle')
      const externalTiming=Number.isFinite(Number(entry.createdAt))&&(running||execution?.endedAt)?{settledMs:Math.max(0,(running?now:execution.endedAt)-Number(entry.createdAt))}:undefined
      const row={entry,v,parentId,parentName,depth,running,state,error,elapsed:duration(outside?externalTiming:v.subagentTiming,running,now),name:entry.label||summary.title||id,modelLabel:outside?configuredExternalModel(execution?.toolName):model(v),usageKnown:Boolean(v.tokenUsage),activityNote:outside?(running?'已启动，等待执行结果':execution?.summary||'外部执行状态未公开'):undefined}
      rows.push(row); if(!outside)walk(entry.id,row.name,depth+1)
    }
  }
  walk(sessionId,'Leader',0)
  const running=leaderRunning
  const lastMeaningful=ordered(nodes).filter(node=>['turn-error','assistant-step','user','tool-call'].includes(node.kind)).at(-1)
  const lastError=lastMeaningful?.kind==='turn-error'||leaderSnapshot.lastAgentError
  const state=running?'running':statuses.get(sessionId)?.pendingInteraction?'waiting':lastError?'failed':nodes.length?'completed':'idle'
  const prompt=ordered(nodes).filter(n=>n.kind==='user').at(-1)
  return {parent,rows,workflows,refreshIds,leader:{running,state,action:latestAction(nodes,running),model:model(parent)},skills:{used:skillNames(nodes),recommended:recommendSkills(textParts(prompt?.data?.content))}}
}
function Dot({state}) { return h('span',{className:`dsh-crew-dot ${state}`,'aria-hidden':true}) }
function Row({row}) {
  return h('div',{className:'dsh-crew-row','data-state':row.state,'data-agent-id':String(row.entry.id)},h(Dot,{state:row.state}),h('div',null,h('div',{className:'dsh-crew-name'},row.name),h('div',{className:'dsh-crew-meta'},row.modelLabel),h('div',{className:'dsh-crew-meta'},`${row.entry.mode} · ${row.elapsed} · ${row.usageKnown?tokens(row.v.tokenUsage):'—'} tok`),row.activityNote?h('div',{className:'dsh-crew-meta'},row.entry.mode==='external'&&row.running?'已启动，等待执行结果':row.activityNote):null,row.error?h('div',{className:'dsh-crew-meta'},row.error):null),h('span',{className:'dsh-crew-state'},labels[row.state]))
}
function Workflow({node}) {
  const d=node.data||{},members=(d.phases||[]).flatMap(p=>p.members||[]),done=members.filter(m=>m.status==='completed').length,ended=members.filter(m=>m.status!=='running').length
  return h('div',{className:'dsh-crew-workflow'},h('div',{className:'dsh-crew-rowhead'},h(Dot,{state:d.status}),h('strong',null,d.name||'Workflow')),h('div',{className:'dsh-crew-meta'},`${labels[d.status]||d.status||'运行中'} · ${done}/${members.length} 完成${ended>done?` · ${ended-done} 取消或失败`:''}`),h('div',{className:'dsh-crew-progress',role:'progressbar','aria-label':d.name||'Workflow','aria-valuenow':done,'aria-valuemin':0,'aria-valuemax':members.length||1},h('i',{style:{width:`${members.length?Math.round(done/members.length*100):0}%`}})),...members.map(m=>h('div',{key:String(m.seq),className:'dsh-crew-meta'},`${m.label} · ${labels[m.status]||m.status}`)))
}
function CrewPanel({sessionId,useSessions,useSessionStatus,useConversation,useSession,refreshProjection,readChildError,openLanes}) {
  const [open,setOpen]=React.useState(false),[now,setNow]=React.useState(Date.now),triggerRef=React.useRef(null),panelRef=React.useRef(null),requested=React.useRef(new Set()),dialogId=React.useId()
  const sessions=useSessions(s=>s),statuses=useSessionStatus(s=>s),conversation=useConversation(s=>s),leaderSnapshot=useSession(s=>s)
  const nodes=nodesOf(conversation),childErrors={}
  for(const id of Object.keys(sessions.projectionsBySession||{})) { const error=readChildError?.(id); if(error)childErrors[id]=error }
  const crew=buildCrewSnapshot({sessionId,sessions,statuses,nodes,leaderSnapshot,childErrors,now})
  const position=useAnchoredPosition({open,anchorRef:triggerRef,panelRef,gap:8,margin:12,align:'start'})
  const idsKey=crew.refreshIds.join('|')
  React.useEffect(()=>{requested.current.clear();setOpen(false)},[sessionId])
  React.useEffect(()=>{if(!open)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[open])
  React.useEffect(()=>{
    if(!open)return
    for(const id of crew.refreshIds)if(!requested.current.has(id)){requested.current.add(id);Promise.resolve(refreshProjection?.(id)).catch(()=>{})}
  },[open,idsKey,refreshProjection])
  React.useEffect(()=>{
    if(!open)return
    const close=event=>{if(!triggerRef.current?.contains(event.target)&&!panelRef.current?.contains(event.target))setOpen(false)}
    const key=event=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus()}}
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}
  },[open])
  const close=()=>{setOpen(false);triggerRef.current?.focus()}
  const refresh=()=>{for(const id of crew.refreshIds)Promise.resolve(refreshProjection?.(id)).catch(()=>{})}
  const skills=crew.skills.used.length?crew.skills.used:crew.skills.recommended
  const panel=h('div',{ref:panelRef,id:dialogId,className:'dsh-crew-panel',role:'dialog','aria-label':'Crew 多 agent 统筹',style:position||{visibility:'hidden'}},
    h('div',{className:'dsh-crew-head'},h('div',{className:'dsh-crew-title'},h(Dot,{state:crew.leader.state}),h('h3',null,'Leader 指挥台')),openLanes?h('button',{className:'dsh-crew-refresh',type:'button',onClick:()=>{openLanes(sessionId);setOpen(false)},'aria-label':'在右侧栏打开 Crew 泳道'},'泳道视图'):null,h('button',{className:'dsh-crew-close',type:'button',onClick:close,'aria-label':'关闭 Crew'},'×')),
    h('div',{className:'dsh-crew-leader'},h('div',{className:'dsh-crew-rowhead'},h('strong',null,'Leader'),h('span',{className:'dsh-crew-state'},labels[crew.leader.state])),h('div',{className:'dsh-crew-meta'},crew.leader.model),h('div',{className:'dsh-crew-action','aria-label':'Leader 最近一步'},crew.leader.action)),
    h('section',{className:'dsh-crew-section'},h('h4',null,`执行者 · ${crew.rows.filter(r=>r.running).length} 运行 / ${crew.rows.length} 总数`),crew.rows.length?crew.rows.map(row=>h(Row,{row,key:String(row.entry.id)})):h('div',{className:'dsh-crew-muted'},'暂无委派；Leader 可以直接完成小需求。')),
    h('section',{className:'dsh-crew-section'},h('h4',null,'委派关系'),crew.rows.length?crew.rows.map(row=>h('div',{className:'dsh-crew-relation',key:String(row.entry.id),style:{marginLeft:`${row.depth*14+3}px`}},`${row.parentName} → ${row.name}`)):h('div',{className:'dsh-crew-muted'},'Leader 直接执行')),
    h('section',{className:'dsh-crew-section'},h('h4',null,'Workflow 扇出'),crew.workflows.length?crew.workflows.slice(-3).map(node=>h(Workflow,{node,key:node.key||node.id||node.anchorSeq})):h('div',{className:'dsh-crew-muted'},'当前会话暂无工作流')),
    h('section',{className:'dsh-crew-section'},h('h4',null,crew.skills.used.length?'已使用技能':'建议技能'),h('div',{className:'dsh-crew-skills'},skills.map(skill=>h('span',{key:skill,className:`dsh-crew-skill${crew.skills.used.length?' used':''}`},skill)))),
    h('div',{className:'dsh-crew-foot'},h('div',{className:'dsh-crew-meta'},`Leader ${tokens(crew.parent.tokenUsage)} tok · 子 agent ${crew.rows.some(row=>!row.usageKnown)?'—':tokens(crew.rows.reduce((n,row)=>n+sum(row.v.tokenUsage),0))} tok`),h('button',{className:'dsh-crew-refresh',type:'button',onClick:refresh,'aria-label':'刷新 Crew'},'刷新')))
  return h('span',{className:'dsh-crew-root'},h('button',{ref:triggerRef,className:'dsh-crew-trigger',type:'button',onClick:()=>setOpen(v=>!v),'aria-haspopup':'dialog','aria-controls':dialogId,'aria-expanded':open},h(Dot,{state:crew.leader.state}),h('span',null,'Crew'),h('span',{className:'dsh-crew-muted'},crew.rows.some(r=>r.running)?`${crew.rows.filter(r=>r.running).length} 执行中`:labels[crew.leader.state])),open?createPortal(panel,document.body):null)
}
/** Fold the lanes model for one Lead Session from the same public sources as the Crew panel plus `agentTeam`. */
function crewLanesModel({sessionId,sessions={},statuses=new Map(),nodes=[],leaderSnapshot={},childErrors={},now=Date.now(),runs=[]}) {
  const snapshot=buildCrewSnapshot({sessionId,sessions,statuses,nodes,leaderSnapshot,childErrors,now})
  const team=(sessions.projectionsBySession||{})[sessionId]?.values?.agentTeam||sessions.byId?.[sessionId]?.projectionValues?.agentTeam
  const activity=[...externalActivity(nodes)]
  const toolNames=new Map(activity.filter(([,value])=>value.toolName).map(([id,value])=>[id,value.toolName]))
  const prompts=new Map(activity.filter(([,value])=>value.prompt).map(([id,value])=>[id,value.prompt]))
  return {snapshot,model:buildLanes({snapshot,nodes,team,toolNames,results:settledResults(nodes),leadSessionId:sessionId,runs,prompts,now})}
}
function CrewLanesTab({sessionId,useSessions,useSessionStatus,useConversation,useSession,refreshProjection,readChildError,openChild,listProgress}) {
  const [now,setNow]=React.useState(Date.now),[runs,setRuns]=React.useState([]),requested=React.useRef(new Set())
  const sessions=useSessions(s=>s),statuses=useSessionStatus(s=>s),conversation=useConversation(s=>s),leaderSnapshot=useSession(s=>s)
  const nodes=nodesOf(conversation),childErrors={}
  for(const id of Object.keys(sessions.projectionsBySession||{})) { const error=readChildError?.(id); if(error)childErrors[id]=error }
  const {snapshot,model}=crewLanesModel({sessionId,sessions,statuses,nodes,leaderSnapshot,childErrors,now,runs})
  const running=model.cards.some(card=>card.state==='running')
  // Recorded Gemini/Grok/Codex steps: polled while one of them runs, read once otherwise.
  const acp=model.cards.filter(card=>card.kind==='run'&&['gemini','grok','codex'].includes(card.laneId))
  const acpRunning=acp.some(card=>card.state==='running'),since=acp.length?Math.max(0,Math.min(...acp.map(card=>card.createdAt))-60000):0
  React.useEffect(()=>{
    if(!acp.length||!listProgress)return
    let alive=true
    const load=()=>Promise.resolve(listProgress(since)).then(value=>{if(alive&&Array.isArray(value?.runs))setRuns(value.runs)}).catch(()=>{})
    load()
    if(!acpRunning)return()=>{alive=false}
    const timer=setInterval(load,2000)
    return()=>{alive=false;clearInterval(timer)}
  },[acp.length,acpRunning,since,listProgress])
  React.useEffect(()=>{requested.current.clear()},[sessionId])
  React.useEffect(()=>{if(!running)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[running])
  React.useEffect(()=>{for(const id of snapshot.refreshIds)if(!requested.current.has(id)){requested.current.add(id);Promise.resolve(refreshProjection?.(id)).catch(()=>{})}},[snapshot.refreshIds.join('|'),refreshProjection])
  // React Flow and dagre load on first use of the tab, never with the header action.
  const {LanesView}=require('./lanes-view.cjs')
  return h(LanesView,{model,onOpen:card=>openChild?.(card)})
}
function CrewLanesTitle() { return 'Crew 泳道' }
function apply(ctx) {
  const actions={refreshProjection:id=>ctx.sessions.refreshProjections(id),readChildError:id=>ctx.sessions.binding(id)?.session?.getSnapshot?.().lastAgentError}
  const openLanes=sessionId=>ctx.sidebarRight.openTab(LANES_KIND,{params:{sessionId}})
  // Progress Remote (Host service crewProgress). Without it the lanes view simply omits external steps.
  let progressApi
  const listProgress=async since=>{
    if(!progressApi)return {runs:[]}
    const result=await progressApi.list({since})
    if(result&&typeof result==='object'&&'ok' in result){if(!result.ok)throw new Error(result.error?.message||'crewProgress failed');return result.value}
    return result
  }
  if(ctx.remote?.$mount)ctx.effect(async()=>{
    const unmount=await ctx.remote.$mount(crewRemote)
    const fiber=ctx.inject(['remote.crewProgress'],remoteCtx=>{progressApi=remoteCtx.remote.crewProgress;remoteCtx.effect(()=>()=>{progressApi=undefined},'dsh-plugin-crew: progress api')})
    try{await fiber}catch(error){await unmount();throw error}
    return async()=>{await fiber.dispose();await unmount()}
  },'dsh-plugin-crew: progress remote')
  const openChild=card=>ctx.uiWorkspace.openSession(card.parentId&&card.mode&&card.mode!=='external'?{parentSessionId:card.parentId,childSessionId:card.childId,mode:card.mode}:card.childId)
  ctx.effect(()=>ctx.sidebarRightTabs.register({id:LANES_ID,kind:LANES_KIND,priority:'extension',title:()=>'Crew 泳道',
    guide:[{id:'crew-lanes',order:60,title:()=>'Crew 泳道',description:()=>'按执行者分泳道查看委派、团队任务依赖与返工'}]}),'dsh-plugin-crew: lanes tab type')
  ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:LANES_ID,inject:()=>({...actions,openChild,listProgress})},CrewLanesTab))
  ctx.slots.inject('sidebar.right.pane.tab.title',()=>ctx.slots.register({name:'sidebar.right.pane.tab.title',key:LANES_ID},CrewLanesTitle))
  ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'crew',order:-30,inject:()=>({...actions,openLanes})},CrewPanel))
}
module.exports={inject,apply,CrewPanel,CrewLanesTab,crewLanesModel,buildLanes,buildCrewSnapshot,latestAction,recommendSkills,duration,sum,nodesOf,externalActivity,settledResults}
