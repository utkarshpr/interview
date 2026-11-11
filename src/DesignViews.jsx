import { useEffect, useMemo, useRef, useState } from 'react';
import { lldProblems } from './data/lldProblems.js';
import { hldQuestions, buildTemplate } from './data/hldQuestions.js';

const blankBoard = (id = `board-${Date.now()}`, name = 'Trading Platform Design') => ({id,name,elements:[]});
const shortTitle=(title)=>{const text=title.replace(/^Design (a |an )?/i,'');return text.charAt(0).toUpperCase()+text.slice(1);};
const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const tools = [['select','Select'],['hand','Hand'],['draw','Draw'],['rectangle','Rectangle'],['ellipse','Ellipse'],['diamond','Diamond'],['client','Client'],['server','Server'],['gateway','API Gateway'],['load-balancer','Load balancer'],['cdn','CDN'],['storage','S3 / Object store'],['service','Service'],['database','Database'],['queue','Queue'],['cache','Cache'],['text','Text'],['line','Line'],['arrow','Arrow']];

export function HLDWhiteboard({ boards = [], onChange }) {
  const initial=boards[0] || blankBoard('board-default');
  const [boardId,setBoardId]=useState(initial.id);
  const [draft,setDraft]=useState(initial);
  const [tool,setTool]=useState('select');
  const [selectedId,setSelectedId]=useState('');
  const [lineDraft,setLineDraft]=useState(null);
  const [zoom,setZoom]=useState(1);
  const [viewOffset,setViewOffset]=useState({x:0,y:0});
  const [history,setHistory]=useState({past:[],future:[]});
  const gestureRef=useRef(null);
  const svgRef=useRef(null);
  const timerRef=useRef(null);
  const persistRef=useRef({boards,onChange,draft});
  persistRef.current={boards,onChange,draft};
  const selected=draft.elements.find((element)=>element.id===selectedId);
  const [qId,setQId]=useState(initial.questionId||hldQuestions[0].id);
  const [qArea,setQArea]=useState('all');
  const [qLevel,setQLevel]=useState('all');
  const [qOpen,setQOpen]=useState(true);
  const question=hldQuestions.find((entry)=>entry.id===qId)||hldQuestions[0];
  const qAreas=[...new Set(hldQuestions.map((entry)=>entry.area))];
  const visibleQuestions=hldQuestions.filter((entry)=>(qArea==='all'||entry.area===qArea)&&(qLevel==='all'||entry.level===qLevel));
  function startQuestion(withTemplate) {
    clearTimeout(timerRef.current);
    const base=boards.filter((entry)=>entry.id!==draft.id);
    const currentIsMeaningful=boards.some((entry)=>entry.id===draft.id)||draft.elements.length>0||draft.name!=='Trading Platform Design';
    const existing=currentIsMeaningful?[...base,draft]:base;
    const board={id:`board-${Date.now()}`,name:shortTitle(question.title),questionId:question.id,elements:withTemplate?buildTemplate(question.template):[]};
    onChange([...existing,board]);setBoardId(board.id);setDraft(board);setSelectedId('');setHistory({past:[],future:[]});setViewOffset({x:0,y:0});setZoom(1);
  }

  useEffect(()=>{
    const saved=boards.find((board)=>board.id===boardId);
    if(saved) {setDraft(saved);if(saved.questionId) setQId(saved.questionId);}
    else if(!boards.length) setDraft(initial);
  },[boardId]);

  function scheduleSave(next,trackHistory=true) {
    if(trackHistory)setHistory((current)=>({past:[...current.past,draft].slice(-80),future:[]}));
    setDraft(next);
    clearTimeout(timerRef.current);
    timerRef.current=window.setTimeout(()=>{
      const current=persistRef.current;
      current.onChange(current.boards.some((entry)=>entry.id===current.draft.id)
        ? current.boards.map((entry)=>entry.id===current.draft.id?current.draft:entry)
        : [...current.boards,current.draft]);
    },450);
  }
  function saveNow() {
    clearTimeout(timerRef.current);
    const nextBoards=boards.some((entry)=>entry.id===draft.id)?boards.map((entry)=>entry.id===draft.id?draft:entry):[...boards,draft];
    onChange(nextBoards);
  }
  function createBoard() {
    clearTimeout(timerRef.current);
    const base=boards.filter((entry)=>entry.id!==draft.id);
    const currentIsMeaningful=boards.some((entry)=>entry.id===draft.id)||draft.elements.length>0||draft.name!=='Trading Platform Design';
    const existing=currentIsMeaningful?[...base,draft]:base;
    const nameBase='Trading Platform Design';
    let suffix=existing.filter((entry)=>entry.name===nameBase||entry.name.startsWith(`${nameBase} `)).length+1;
    const board=blankBoard(undefined,suffix===1?nameBase:`${nameBase} ${suffix}`);
    onChange([...existing,board]); setBoardId(board.id); setDraft(board); setSelectedId('');setHistory({past:[],future:[]});
  }
  function deleteBoard(){clearTimeout(timerRef.current);const rest=boards.filter((board)=>board.id!==boardId);if(rest.length){const next=rest.at(-1);onChange(rest);setBoardId(next.id);setDraft(next);}else{const next=blankBoard('board-default');onChange([]);setBoardId(next.id);setDraft(next);}setSelectedId('');setHistory({past:[],future:[]});}
  function point(event) {
    const svg=svgRef.current,point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const local=point.matrixTransform(svg.getScreenCTM().inverse());
    return {x:Math.max(0,Math.min(1200,local.x)),y:Math.max(0,Math.min(700,local.y))};
  }
  function addNode(event) {
    const pos=point(event); const type=tool;
    const labels={client:'Client / Web app',server:'Application server',gateway:'API Gateway', 'load-balancer':'Load Balancer',cdn:'CDN',storage:'S3 / Object Storage',service:'Service',database:'Database',queue:'Event queue',cache:'Cache',text:'Text',rectangle:'',ellipse:'',diamond:''};
    const element={id:makeId(type),type,x:Math.max(12,pos.x-77),y:Math.max(12,pos.y-35),w:type==='text'?220:154,h:type==='text'?48:70,label:labels[type]||'',color:type==='database'||type==='storage'?'#e9f1ff':type==='queue'||type==='load-balancer'?'#fff4df':type==='cache'||type==='cdn'?'#fff0ed':type==='client'||type==='gateway'?'#f1ecff':'#edf6ef'};
    scheduleSave({...draft,elements:[...draft.elements,element]}); setSelectedId(element.id);setTool('select');
  }
  function startPointer(event) {
    const pos=point(event);
    if(tool==='hand') { event.preventDefault();svgRef.current.setPointerCapture(event.pointerId);gestureRef.current={kind:'pan',startX:event.clientX,startY:event.clientY,offset:{...viewOffset}};return; }
    if(tool==='draw') { event.preventDefault();svgRef.current.setPointerCapture(event.pointerId);gestureRef.current={kind:'draw',points:[pos]};setLineDraft({kind:'draw',points:[pos]});return; }
    if(tool==='line'||tool==='arrow') { event.preventDefault();svgRef.current.setPointerCapture(event.pointerId);setLineDraft({kind:tool,x:pos.x,y:pos.y,x2:pos.x,y2:pos.y});return; }
    if(tool!=='select') { event.preventDefault();addNode(event);return; }
    setSelectedId('');
  }
  function startElementDrag(event,element) {
    event.stopPropagation();setSelectedId(element.id);
    if(tool==='arrow') { const pos=point(event);svgRef.current.setPointerCapture(event.pointerId);setLineDraft({x:pos.x,y:pos.y,x2:pos.x,y2:pos.y});return; }
    if(tool!=='select') return;
    const pos=point(event);event.preventDefault();svgRef.current.setPointerCapture(event.pointerId);
    gestureRef.current={kind:'move',before:draft,id:element.id,start:{px:pos.x,py:pos.y,x:element.x,y:element.y,x2:element.x2,y2:element.y2,points:element.points}};
    event.currentTarget.dataset.dragStart=JSON.stringify({px:pos.x,py:pos.y,x:element.x,y:element.y});
  }
  function movePointer(event) {
    const pos=point(event);
    if(gestureRef.current?.kind==='pan') {const gesture=gestureRef.current;const rect=svgRef.current.getBoundingClientRect();const scale=1200*zoom/rect.width;setViewOffset({x:gesture.offset.x-(event.clientX-gesture.startX)*scale,y:gesture.offset.y-(event.clientY-gesture.startY)*scale});return;}
    if(gestureRef.current?.kind==='draw') {const points=[...gestureRef.current.points,pos];gestureRef.current.points=points;setLineDraft({kind:'draw',points});return;}
    if(lineDraft) { setLineDraft({...lineDraft,x2:pos.x,y2:pos.y});return; }
    if(gestureRef.current?.kind==='move'&&event.buttons&&tool==='select'){const gesture=gestureRef.current,dx=pos.x-gesture.start.px,dy=pos.y-gesture.start.py;scheduleSave({...draft,elements:draft.elements.map((element)=>element.id===gesture.id?{...element,...(element.type==='stroke'?{points:gesture.start.points.map((point)=>({x:point.x+dx,y:point.y+dy}))}:{x:Math.max(4,gesture.start.x+dx),y:Math.max(4,gesture.start.y+dy)}),...(element.type==='arrow'||element.type==='line'?{x2:gesture.start.x2+dx,y2:gesture.start.y2+dy}:{})}:element)},false);return;}
    const node=event.target.closest('[data-diagram-id]');
    if(!node||!event.buttons||tool!=='select')return;
    return;
  }
  function endPointer() {
    if(gestureRef.current?.kind==='draw') {const points=gestureRef.current.points;if(points.length>1){const stroke={id:makeId('stroke'),type:'stroke',points,color:'#334a3b',width:3};scheduleSave({...draft,elements:[...draft.elements,stroke]});setSelectedId(stroke.id);}gestureRef.current=null;setLineDraft(null);return;}
    if(gestureRef.current?.kind==='pan'){gestureRef.current=null;return;}
    if(gestureRef.current?.kind==='move'){const before=gestureRef.current.before;setHistory((current)=>({past:[...current.past,before].slice(-80),future:[]}));gestureRef.current=null;}
    if(lineDraft && Math.hypot(lineDraft.x2-lineDraft.x,lineDraft.y2-lineDraft.y)>10) {
      const shape={id:makeId(lineDraft.kind),type:lineDraft.kind,...lineDraft,label:'',color:'#71867a'};delete shape.kind;
      scheduleSave({...draft,elements:[...draft.elements,shape]});setSelectedId(shape.id);
    }
    setLineDraft(null);
    const active=svgRef.current?.querySelector('[data-drag-start]'); if(active) delete active.dataset.dragStart;
  }
  function undo(){if(!history.past.length)return;const previous=history.past.at(-1);setHistory({past:history.past.slice(0,-1),future:[draft,...history.future]});setDraft(previous);onChange(boards.some((board)=>board.id===previous.id)?boards.map((board)=>board.id===previous.id?previous:board):[...boards,previous]);}
  function redo(){if(!history.future.length)return;const next=history.future[0];setHistory({past:[...history.past,draft],future:history.future.slice(1)});setDraft(next);onChange(boards.some((board)=>board.id===next.id)?boards.map((board)=>board.id===next.id?next:board):[...boards,next]);}
  function duplicateSelected(){if(!selected)return;const copy={...selected,id:makeId(selected.type),...(selected.type==='stroke'?{points:selected.points.map((point)=>({x:point.x+24,y:point.y+24}))}:{x:(selected.x||0)+24,y:(selected.y||0)+24}),...(selected.type==='arrow'||selected.type==='line'?{x2:selected.x2+24,y2:selected.y2+24}:{})};scheduleSave({...draft,elements:[...draft.elements,copy]});setSelectedId(copy.id);}
  function zoomBy(amount){setZoom((value)=>Math.max(.5,Math.min(2.5,Math.round((value+amount)*100)/100)));}
  useEffect(()=>{function onKeyDown(event){if(event.target instanceof HTMLElement && ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;const mod=event.metaKey||event.ctrlKey;if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}else if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}else if(event.key==='Delete'||event.key==='Backspace'){deleteSelected();}else if(mod&&event.key.toLowerCase()==='d'){event.preventDefault();duplicateSelected();}else if(event.key==='Escape'){setTool('select');setSelectedId('');}}window.addEventListener('keydown',onKeyDown);return()=>window.removeEventListener('keydown',onKeyDown);},[history,selectedId,draft,boards]);
  function updateElement(patch) { if(!selected)return; scheduleSave({...draft,elements:draft.elements.map((element)=>element.id===selected.id?{...element,...patch}:element)}); }
  function deleteSelected() { if(!selected)return; scheduleSave({...draft,elements:draft.elements.filter((element)=>element.id!==selected.id)});setSelectedId(''); }
  function renameBoard(name) { scheduleSave({...draft,name}); }
  function downloadSvg() {
    if(!svgRef.current)return;
    const clone=svgRef.current.cloneNode(true);clone.removeAttribute('class');clone.setAttribute('width','1200');clone.setAttribute('height','700');
    clone.querySelectorAll('.diagram-node-label').forEach((text)=>{text.setAttribute('fill','#26352b');text.setAttribute('font-family','Arial, sans-serif');text.setAttribute('font-size','14');text.setAttribute('font-weight','600');});
    clone.querySelectorAll('.diagram-free-text,.diagram-arrow-label').forEach((text)=>{text.setAttribute('fill','#26352b');text.setAttribute('font-family','Arial, sans-serif');text.setAttribute('font-size','16');});
    const xml=new XMLSerializer().serializeToString(clone);const blob=new Blob([xml],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${(draft.name||'hld-board').toLowerCase().replace(/[^a-z0-9]+/g,'-')}.svg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const displayedBoards=boards.some((board)=>board.id===draft.id)?boards.map((board)=>board.id===draft.id?draft:board):[...boards,draft];
  const nameCounts={};const boardOptions=displayedBoards.map((board)=>{const name=board.name||'Untitled board';nameCounts[name]=(nameCounts[name]||0)+1;return {...board,optionLabel:nameCounts[name]===1?name:`${name} (${nameCounts[name]})`};});
  return <div className="page-content feature-page"><header className="feature-header"><div className="eyebrow"><span className="eyebrow-mark"/>HIGH-LEVEL DESIGN</div><h1>Architecture whiteboard</h1><p>Sketch services, data stores, queues, and request flows. Boards save to this learner profile and sync with it.</p></header><section className="hld-bank"><button className="hld-bank-toggle" onClick={()=>setQOpen(!qOpen)} aria-expanded={qOpen}><span><strong>Interview question bank</strong><small>{hldQuestions.length} system design questions · pick one, then sketch your answer below</small></span><span className="hld-bank-chevron">{qOpen?'−':'+'}</span></button>{qOpen&&<div className="hld-bank-body"><aside className="hld-bank-list"><div className="hld-bank-filters"><select aria-label="Filter by topic" value={qArea} onChange={(event)=>setQArea(event.target.value)}><option value="all">All topics</option>{qAreas.map((area)=><option key={area}>{area}</option>)}</select><select aria-label="Filter by level" value={qLevel} onChange={(event)=>setQLevel(event.target.value)}><option value="all">All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></div><div className="hld-bank-items">{visibleQuestions.map((entry)=><button key={entry.id} className={entry.id===question.id?'hld-q hld-q--active':'hld-q'} onClick={()=>setQId(entry.id)}><strong>{shortTitle(entry.title)}</strong><span>{entry.area} · {entry.level}</span></button>)}{!visibleQuestions.length&&<p className="feature-empty">No questions match these filters.</p>}</div></aside><article className="hld-bank-detail"><div className="hld-bank-meta"><span className="hld-chip">{question.level}</span><span className="hld-chip hld-chip--muted">{question.area}</span></div><h2>{question.title}</h2><p className="hld-bank-prompt">{question.prompt}</p><div className="hld-bank-grid"><div><h3>Functional requirements</h3><ul>{question.functional.map((item)=><li key={item}>{item}</li>)}</ul></div><div><h3>Non-functional requirements</h3><ul>{question.nonFunctional.map((item)=><li key={item}>{item}</li>)}</ul></div></div><div className="hld-bank-scale"><strong>Back-of-envelope scale</strong><span>{question.scale}</span></div><div className="hld-bank-grid"><div><h3>Deep-dive topics</h3><ul>{question.deepDives.map((item)=><li key={item}>{item}</li>)}</ul></div><div><h3>Trade-offs to discuss</h3><ul>{question.tradeoffs.map((item)=><li key={item}>{item}</li>)}</ul></div></div><div className="hld-bank-actions"><button className="primary-button" onClick={()=>startQuestion(false)}>Start blank board</button><button className="secondary-button" onClick={()=>startQuestion(true)}>Load reference architecture</button><span>Creates a new board named after this question. Try drawing your own design first, then compare.</span></div></article></div>}</section><div className="whiteboard-toolbar"><select aria-label="Choose design board" value={boardId} onChange={(event)=>{saveNow();clearTimeout(timerRef.current);setHistory({past:[],future:[]});setSelectedId('');setViewOffset({x:0,y:0});setZoom(1);setBoardId(event.target.value);}}>{boardOptions.map((board)=><option key={board.id} value={board.id}>{board.optionLabel}</option>)}</select><button className="secondary-button" onClick={createBoard}>+ New board</button><button className="whiteboard-delete" onClick={deleteBoard}>Delete board</button><button className="secondary-button" onClick={undo} disabled={!history.past.length} title="Undo (⌘/Ctrl+Z)">↶ Undo</button><button className="secondary-button" onClick={redo} disabled={!history.future.length} title="Redo (⌘/Ctrl+Shift+Z)">↷ Redo</button><button className="secondary-button" onClick={()=>zoomBy(-.1)}>−</button><span className="whiteboard-zoom">{Math.round(zoom*100)}%</span><button className="secondary-button" onClick={()=>zoomBy(.1)}>+</button><input aria-label="Board name" value={draft.name} onChange={(event)=>renameBoard(event.target.value)} /><button className="secondary-button" onClick={saveNow}>Save board</button><button className="secondary-button" onClick={downloadSvg}>Download SVG</button></div><div className="whiteboard-tools" role="toolbar" aria-label="Diagram tools">{tools.map(([id,label])=><button key={id} className={tool===id?'whiteboard-tool whiteboard-tool--active':'whiteboard-tool'} onClick={()=>setTool(id)}>{label}</button>)}<span>Draw, add shapes, or drag with Hand to pan. Wheel controls zoom.</span></div><div className="whiteboard-layout"><div className="whiteboard-canvas-wrap"><svg ref={svgRef} className="whiteboard-canvas" viewBox={`${viewOffset.x} ${viewOffset.y} ${1200/zoom} ${700/zoom}`} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={(event)=>{event.preventDefault();zoomBy(event.deltaY<0?.08:-.08);}} aria-label="Architecture diagram canvas"><defs><pattern id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="#edf1ec" strokeWidth="1"/></pattern><marker id="board-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#71867a"/></marker></defs><rect className="board-background" x="0" y="0" width="1200" height="700" fill="url(#board-grid)"/><g className="diagram-arrows">{draft.elements.filter((element)=>element.type==='arrow').map((element)=><g key={element.id} onPointerDown={(event)=>startElementDrag(event,element)} data-diagram-id={element.id} className={selectedId===element.id?'diagram-selected':''}><line x1={element.x} y1={element.y} x2={element.x2} y2={element.y2} stroke={element.color} strokeWidth="3" markerEnd="url(#board-arrow)"/>{element.label&&<text x={(element.x+element.x2)/2} y={(element.y+element.y2)/2-8} className="diagram-arrow-label">{element.label}</text>}<line x1={element.x} y1={element.y} x2={element.x2} y2={element.y2} stroke="transparent" strokeWidth="18"/></g>)}</g>{draft.elements.filter((element)=>element.type!=='arrow'&&element.type!=='line'&&element.type!=='stroke').map((element)=><g key={element.id} data-diagram-id={element.id} className={`diagram-node ${selectedId===element.id?'diagram-selected':''}`} onPointerDown={(event)=>startElementDrag(event,element)}>{element.type==='text'?<><rect x={element.x} y={element.y} width={element.w} height={element.h} rx="6" fill="transparent" stroke={selectedId===element.id?'#6f9d77':'transparent'} strokeDasharray="5 4"/><text x={element.x+7} y={element.y+27} className="diagram-free-text">{element.label}</text></>:element.type==='storage'?<><path d={`M ${element.x} ${element.y+10} C ${element.x} ${element.y-2}, ${element.x+element.w} ${element.y-2}, ${element.x+element.w} ${element.y+10} L ${element.x+element.w} ${element.y+element.h-10} C ${element.x+element.w} ${element.y+element.h+2}, ${element.x} ${element.y+element.h+2}, ${element.x} ${element.y+element.h-10} Z`} fill={element.color} stroke="#c8d8e8" strokeWidth="2"/><ellipse cx={element.x+element.w/2} cy={element.y+10} rx={element.w/2} ry="8" fill={element.color} stroke="#c8d8e8" strokeWidth="2"/><text x={element.x+element.w/2} y={element.y+element.h/2+4} textAnchor="middle" className="diagram-node-label">{element.label}</text></>:element.type==='diamond'?<><path d={`M ${element.x+element.w/2} ${element.y} L ${element.x+element.w} ${element.y+element.h/2} L ${element.x+element.w/2} ${element.y+element.h} L ${element.x} ${element.y+element.h/2} Z`} fill="#edf6ef" stroke="#d7e2d7" strokeWidth="2"/><text x={element.x+element.w/2} y={element.y+element.h/2+4} textAnchor="middle" className="diagram-node-label">{element.label}</text></>:element.type==='rectangle'?<><rect x={element.x} y={element.y} width={element.w} height={element.h} rx="2" fill="#edf6ef" stroke="#d7e2d7" strokeWidth="2"/><text x={element.x+element.w/2} y={element.y+element.h/2+4} textAnchor="middle" className="diagram-node-label">{element.label}</text></>:element.type==='ellipse'||element.type==='cache'?<><ellipse cx={element.x+element.w/2} cy={element.y+element.h/2} rx={element.w/2} ry={element.h/2} fill={element.color} stroke="#c8d8cb" strokeWidth="2"/><text x={element.x+element.w/2} y={element.y+element.h/2+4} textAnchor="middle" className="diagram-node-label">{element.label}</text></>:<><rect x={element.x} y={element.y} width={element.w} height={element.h} rx={element.type==='database'?16:9} fill={element.color} stroke={selectedId===element.id?'#6f9d77':'#d7e2d7'} strokeWidth={selectedId===element.id?3:2}/>{element.type==='database'&&<ellipse cx={element.x+element.w/2} cy={element.y+5} rx={element.w/2} ry="6" fill={element.color} stroke="#d7e2d7" strokeWidth="2"/>}<text x={element.x+element.w/2} y={element.y+element.h/2+4} textAnchor="middle" className="diagram-node-label">{element.label}</text></>}</g>)}{draft.elements.filter((element)=>element.type==='stroke').map((stroke)=><polyline key={stroke.id} data-diagram-id={stroke.id} onPointerDown={(event)=>startElementDrag(event,stroke)} points={stroke.points.map((p)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={selectedId===stroke.id?stroke.width+4:stroke.width} strokeLinecap="round" strokeLinejoin="round"/>)}{draft.elements.filter((element)=>element.type==='line').map((element)=><g key={element.id} data-diagram-id={element.id} onPointerDown={(event)=>startElementDrag(event,element)}><line x1={element.x} y1={element.y} x2={element.x2} y2={element.y2} stroke={element.color} strokeWidth={selectedId===element.id?5:3}/><line x1={element.x} y1={element.y} x2={element.x2} y2={element.y2} stroke="transparent" strokeWidth="18"/></g>)}{lineDraft?.kind==='draw'&&<polyline points={lineDraft.points.map((p)=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#334a3b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}{lineDraft&&lineDraft.kind!=='draw'&&<line x1={lineDraft.x} y1={lineDraft.y} x2={lineDraft.x2} y2={lineDraft.y2} stroke="#71867a" strokeWidth="3" strokeDasharray={lineDraft.kind==='arrow'?'none':'7 5'} markerEnd={lineDraft.kind==='arrow'?'url(#board-arrow)':undefined}/>}</svg></div><aside className="whiteboard-properties"><h2>Diagram details</h2>{selected?<><label>Label<input value={selected.label||''} onChange={(event)=>updateElement({label:event.target.value})}/></label>{selected.w&&<div className="whiteboard-dimensions"><label>Width<input aria-label="Shape width" type="number" min="40" max="500" value={Math.round(selected.w)} onChange={(event)=>updateElement({w:Math.max(40,Math.min(500,Number(event.target.value)||40))})}/></label><label>Height<input aria-label="Shape height" type="number" min="30" max="300" value={Math.round(selected.h)} onChange={(event)=>updateElement({h:Math.max(30,Math.min(300,Number(event.target.value)||30))})}/></label></div>}{selected.type!=='arrow'&&selected.type!=='line'&&selected.type!=='text'&&selected.type!=='rectangle'&&selected.type!=='diamond'&&selected.type!=='ellipse'&&<label>Fill<select value={selected.color||'#edf6ef'} onChange={(event)=>updateElement({color:event.target.value})}><option value="#edf6ef">Service green</option><option value="#e9f1ff">Database blue</option><option value="#fff4df">Queue amber</option><option value="#fff0ed">Cache coral</option><option value="#f1ecff">Client violet</option></select></label>}<button className="whiteboard-delete" onClick={()=>duplicateSelected()}>Duplicate selected</button><button className="whiteboard-delete" onClick={deleteSelected}>Delete selected</button></>:<p>Select a shape to edit its label. Use the toolbar to add architecture components or arrows.</p>}<div className="whiteboard-legend"><strong>Architecture building blocks</strong><span>Client · API gateway · load balancer · CDN · servers · services · S3 · databases · cache · queues</span></div></aside></div><p className="whiteboard-save-note">Edits autosave to your learner profile. Cloud backup syncs when connected; the Save board button saves immediately.</p></div>;
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
