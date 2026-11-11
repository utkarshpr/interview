import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { lldProblems } from './data/lldProblems.js';
import { hldQuestions } from './data/hldQuestions.js';
const ExcalidrawCanvas = lazy(() => import('./ExcalidrawCanvas.jsx'));

const blankBoard = (id = `board-${Date.now()}`, name = 'Trading Platform Design') => ({id,name});
const shortTitle=(title)=>{const text=title.replace(/^Design (a |an )?/i,'');return text.charAt(0).toUpperCase()+text.slice(1);};

export function HLDWhiteboard({ boards = [], onChange, theme = 'dark' }) {
  const initial=boards[0] || blankBoard('board-default');
  const [draft,setDraft]=useState(initial);
  const [saveState,setSaveState]=useState('saved');
  const [qId,setQId]=useState(initial.questionId||hldQuestions[0].id);
  const [qArea,setQArea]=useState('all');
  const [qLevel,setQLevel]=useState('all');
  const [qOpen,setQOpen]=useState(false);
  const wrapRef=useRef(null);
  const timerRef=useRef(null);
  const latest=useRef({boards,draft,onChange});
  latest.current={boards,draft,onChange};
  const question=hldQuestions.find((entry)=>entry.id===qId)||hldQuestions[0];
  const qAreas=[...new Set(hldQuestions.map((entry)=>entry.area))];
  const visibleQuestions=hldQuestions.filter((entry)=>(qArea==='all'||entry.area===qArea)&&(qLevel==='all'||entry.level===qLevel));
  const boardOptions=useMemo(()=>{const counts={};const list=boards.some((board)=>board.id===draft.id)?boards:[...boards,draft];return list.map((board)=>{const name=board.name||'Untitled board';counts[name]=(counts[name]||0)+1;return {...board,optionLabel:counts[name]===1?name:`${name} (${counts[name]})`};});},[boards,draft]);

  useEffect(()=>()=>clearTimeout(timerRef.current),[]);
  const upsert=(list,board)=>list.some((entry)=>entry.id===board.id)?list.map((entry)=>entry.id===board.id?board:entry):[...list,board];
  function commit(board) { const current=latest.current; current.onChange(upsert(current.boards,board)); setSaveState('saved'); }
  function flushPending() { if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;commit(latest.current.draft);} }
  function openBoard(board) { flushPending(); setDraft(board); if(board.questionId) setQId(board.questionId); }
  function createBoard(extra={}) {
    flushPending();
    const current=latest.current;
    const meaningful=current.boards.some((entry)=>entry.id===current.draft.id)||current.draft.scene||current.draft.seed;
    const base=meaningful?upsert(current.boards,current.draft):current.boards.filter((entry)=>entry.id!==current.draft.id);
    const nameBase='Trading Platform Design';
    const count=base.filter((entry)=>entry.name===nameBase||entry.name.startsWith(`${nameBase} `)).length+1;
    const board={...blankBoard(undefined,count===1?nameBase:`${nameBase} ${count}`),...extra};
    current.onChange([...base,board]); setDraft(board);
  }
  function startQuestion(withTemplate) { createBoard({name:shortTitle(question.title),questionId:question.id,...(withTemplate?{seed:{template:question.template}}:{})}); }
  function deleteBoard() {
    clearTimeout(timerRef.current);timerRef.current=null;
    const rest=latest.current.boards.filter((board)=>board.id!==draft.id);
    const next=rest.at(-1)||blankBoard('board-default');
    latest.current.onChange(rest); setDraft(next);
  }
  function rename(name) { const next={...draft,name}; setDraft(next); latest.current.draft=next; clearTimeout(timerRef.current); timerRef.current=window.setTimeout(()=>{timerRef.current=null;commit(latest.current.draft);},500); setSaveState('saving'); }
  function sceneChanged(scene) {
    const next={...latest.current.draft,scene,seed:undefined,elements:undefined};
    latest.current.draft=next; setSaveState('saving');
    clearTimeout(timerRef.current);
    timerRef.current=window.setTimeout(()=>{timerRef.current=null;commit(latest.current.draft);},700);
  }
  function fullscreen() { const node=wrapRef.current; if(!node) return; if(document.fullscreenElement) document.exitFullscreen(); else node.requestFullscreen?.(); }

  return <div className="page-content feature-page"><header className="feature-header"><div className="eyebrow"><span className="eyebrow-mark"/>HIGH-LEVEL DESIGN</div><h1>Architecture whiteboard</h1><p>Powered by Excalidraw: sketch services, data stores, queues, and request flows with the full toolset. Boards save to this learner profile and sync with it.</p></header><section className="hld-bank"><button className="hld-bank-toggle" onClick={()=>setQOpen(!qOpen)} aria-expanded={qOpen}><span><strong>Interview question bank</strong><small>{hldQuestions.length} system design questions · pick one, then sketch your answer below</small></span><span className="hld-bank-chevron">{qOpen?'−':'+'}</span></button>{qOpen&&<div className="hld-bank-body"><aside className="hld-bank-list"><div className="hld-bank-filters"><select aria-label="Filter by topic" value={qArea} onChange={(event)=>setQArea(event.target.value)}><option value="all">All topics</option>{qAreas.map((area)=><option key={area}>{area}</option>)}</select><select aria-label="Filter by level" value={qLevel} onChange={(event)=>setQLevel(event.target.value)}><option value="all">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div className="hld-bank-items">{visibleQuestions.map((entry)=><button key={entry.id} className={entry.id===question.id?'hld-q hld-q--active':'hld-q'} onClick={()=>setQId(entry.id)}><strong>{shortTitle(entry.title)}</strong><span>{entry.area} · {entry.level}</span></button>)}{!visibleQuestions.length&&<p className="feature-empty">No questions match these filters.</p>}</div></aside><article className="hld-bank-detail"><div className="hld-bank-meta"><span className="hld-chip">{question.level}</span><span className="hld-chip hld-chip--muted">{question.area}</span></div><h2>{question.title}</h2><p className="hld-bank-prompt">{question.prompt}</p><div className="hld-bank-grid"><div><h3>Functional requirements</h3><ul>{question.functional.map((item)=><li key={item}>{item}</li>)}</ul></div><div><h3>Non-functional requirements</h3><ul>{question.nonFunctional.map((item)=><li key={item}>{item}</li>)}</ul></div></div><div className="hld-bank-scale"><strong>Back-of-envelope scale</strong><span>{question.scale}</span></div><div className="hld-bank-grid"><div><h3>Deep-dive topics</h3><ul>{question.deepDives.map((item)=><li key={item}>{item}</li>)}</ul></div><div><h3>Trade-offs to discuss</h3><ul>{question.tradeoffs.map((item)=><li key={item}>{item}</li>)}</ul></div></div><div className="hld-bank-actions"><button className="primary-button" onClick={()=>startQuestion(false)}>Start blank board</button><button className="secondary-button" onClick={()=>startQuestion(true)}>Load reference architecture</button><span>Creates a new board named after this question. Try drawing your own design first, then compare.</span></div></article></div>}</section><div className="hld-board-bar"><select aria-label="Choose design board" value={draft.id} onChange={(event)=>{const next=boardOptions.find((board)=>board.id===event.target.value);if(next)openBoard(next);}}>{boardOptions.map((board)=><option key={board.id} value={board.id}>{board.optionLabel}</option>)}</select><input aria-label="Board name" value={draft.name||''} onChange={(event)=>rename(event.target.value)}/><button className="secondary-button" onClick={()=>createBoard()}>+ New board</button><button className="secondary-button" onClick={fullscreen}>⛶ Fullscreen</button><button className="whiteboard-delete" onClick={deleteBoard}>Delete board</button><span className={`hld-save hld-save--${saveState}`}>{saveState==='saving'?'Saving…':'All changes saved'}</span></div><div className="hld-canvas" ref={wrapRef}><Suspense fallback={<div className="hld-canvas-loading"><span className="loading-bar"><i/></span>Loading whiteboard…</div>}><ExcalidrawCanvas key={draft.id} board={draft} theme={theme} onSceneChange={sceneChanged}/></Suspense></div><p className="whiteboard-save-note">Edits autosave to your learner profile. Use the Excalidraw menu (☰) to export PNG/SVG, open or save a scene file, and browse shape libraries.</p></div>;
}

const lldFields=[['domain','Domain model','Entities, value objects, and invariants'],['interfaces','Interfaces and classes','Responsibilities and key method signatures'],['flows','Core flows','Step-by-step flow for the main use cases'],['patterns','Patterns and tradeoffs','Patterns used and why they fit'],['concurrency','Concurrency and failure cases','Races, retries, idempotency, and recovery'],['tests','Tests','Unit and integration cases you would write']];
export function LLDStudio({ drafts={}, onChange }) {
  const [problemId,setProblemId]=useState(lldProblems[0].id);
  const [category,setCategory]=useState('all');
  const [level,setLevel]=useState('all');
  const [query,setQuery]=useState('');
  const [draft,setDraft]=useState(drafts[lldProblems[0].id]||{});
  const selected=lldProblems.find((problem)=>problem.id===problemId)||lldProblems[0];
  const categories=[...new Set(lldProblems.map((problem)=>problem.area))];
  const visible=lldProblems.filter((problem)=>(category==='all'||problem.area===category)&&(level==='all'||problem.level===level)&&(!query.trim()||`${problem.title} ${problem.area} ${problem.patterns.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())));
  useEffect(()=>setDraft(drafts[problemId]||{}),[problemId]);
  function save() { const saved={...draft,savedAt:new Date().toISOString()};setDraft(saved);onChange({...drafts,[problemId]:saved}); }
  function download() {
    const content=[`# ${selected.title} — LLD practice`,'',selected.prompt,'','## Requirements',...selected.requirements.map((item)=>`- ${item}`),'',...lldFields.map(([key,label])=>`## ${label}\n\n${draft[key]||'_Not drafted yet._'}`),'','## Follow-up extensions',...selected.extensions.map((item)=>`- ${item}`)].join('\n');
    const blob=new Blob([content],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${selected.id}-lld.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const completion=lldFields.filter(([key])=>draft[key]?.trim()).length;
  return <div className="page-content feature-page"><header className="feature-header"><div className="eyebrow"><span className="eyebrow-mark"/>LOW-LEVEL DESIGN</div><h1>LLD interview practice</h1><p>Work through common object-oriented and backend design problems. Capture entities, interfaces, flows, patterns, concurrency, and tests.</p></header><div className="lld-toolbar"><input type="search" aria-label="Search LLD problems" placeholder="Search problems or patterns…" value={query} onChange={(event)=>setQuery(event.target.value)}/><select aria-label="Filter LLD problems" value={category} onChange={(event)=>setCategory(event.target.value)}><option value="all">All problem types</option>{categories.map((item)=><option key={item}>{item}</option>)}</select><select aria-label="Filter by level" value={level} onChange={(event)=>setLevel(event.target.value)}><option value="all">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select><span>{visible.length} of {lldProblems.length} problems</span></div><div className="lld-layout"><aside className="lld-problem-list">{visible.map((problem)=><button key={problem.id} className={problem.id===problemId?'lld-problem lld-problem--active':'lld-problem'} onClick={()=>setProblemId(problem.id)}><strong>{problem.title}</strong><span>{problem.area} · {problem.level}</span><small>{drafts[problem.id]?`${Object.keys(drafts[problem.id]).filter((key)=>lldFields.some(([field])=>field===key)&&drafts[problem.id][key]?.trim()).length}/6 sections drafted`:'Not started'}</small></button>)}</aside><main className="lld-workspace"><div className="lld-problem-heading"><div><span className="lld-level">{selected.level} · {selected.area}</span><h2>{selected.title}</h2></div><button className="secondary-button" onClick={download}>Download Markdown</button></div><p className="lld-prompt">{selected.prompt}</p><section className="lld-requirements"><h3>Requirements to cover</h3><ul>{selected.requirements.map((item)=><li key={item}>{item}</li>)}</ul><div className="lld-patterns">{selected.patterns.map((pattern)=><span key={pattern}>{pattern}</span>)}</div></section><div className="lld-editors">{lldFields.map(([key,label,hint])=><label className="lld-editor-field" key={`${selected.id}-${key}`}><span><strong>{label}</strong><small>{hint}</small></span><textarea rows={key==='flows'?5:4} value={draft[key]||''} onChange={(event)=>setDraft({...draft,[key]:event.target.value})} placeholder={`Draft your ${label.toLowerCase()}…`}/></label>)}</div><div className="lld-save-row"><span>{draft.savedAt?`Saved ${new Date(draft.savedAt).toLocaleString()}`:`${completion}/6 sections drafted`}</span><button className="primary-button" onClick={save}>Save design</button></div><details className="lld-followups"><summary>Follow-up requirements</summary><ul>{selected.extensions.map((item)=><li key={item}>{item}</li>)}</ul></details></main></div></div>;
}
