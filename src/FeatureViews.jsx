import { useEffect, useMemo, useState } from 'react';
import { resolvePrerequisites } from './data/prerequisites.js';
import { resolveTopicContent } from './data/topicContent.js';
import { supabase } from './supabase.js';
const stableStringify = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.keys(item).sort().reduce((sorted, key) => { sorted[key] = item[key]; return sorted; }, {})
  : item);

const number = new Intl.NumberFormat('en');
const clean = (title) => title.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/^[A-D]\.\s*/, '').trim();
const rubricCriteria = [
  ['correctness','Technical correctness','Accurate concepts and a sound solution'],
  ['clarity','Clarity and structure','A direct answer with an easy-to-follow sequence'],
  ['tradeoffs','Tradeoff reasoning','Relevant alternatives and their costs'],
  ['failureHandling','Failure handling','Realistic edge cases, recovery, and safeguards'],
  ['communication','Communication','Concise explanations that address the question'],
];

function rubricAverage(rubric = {}) {
  const values = rubricCriteria.map(([key]) => Number(rubric[key])).filter(Boolean);
  return values.length ? values.reduce((sum,value) => sum + value,0) / values.length : null;
}

export function PracticeView({ catalog, itemData, completed, onSaveAnswer }) {
  const [sectionId, setSectionId] = useState('all');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const entries = useMemo(() => catalog.sections.flatMap((section) =>
    section.topics.flatMap((topic) => topic.items.map((item) => ({ ...item, section, topic })))
  ), [catalog]);
  const filtered = entries.filter((entry) => {
    const data = itemData[entry.id] || {};
    return (sectionId === 'all' || entry.section.id === sectionId)
      && (kind === 'all' || kind === 'saved' || entry.kind.toLowerCase() === kind)
      && (!query || entry.text.toLowerCase().includes(query.toLowerCase()) || entry.topic.title.toLowerCase().includes(query.toLowerCase()))
      && (kind !== 'saved' || data.answer?.trim());
  });
  const selected = filtered.find((entry) => entry.id === selectedId) || filtered[0];
  return <div className="page-content feature-page">
    <FeatureHeader eyebrow="ANSWER WORKSPACE" title="Practice your answers" subtitle="Draft interview answers and coding approaches against the questions and exercises already in your curriculum." />
    <div className="practice-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions and exercises" aria-label="Search practice prompts"/><select value={sectionId} onChange={(event) => { setSectionId(event.target.value); setSelectedId(null); }} aria-label="Filter by section"><option value="all">All sections</option>{catalog.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select><select value={kind} onChange={(event) => { setKind(event.target.value); setSelectedId(null); }} aria-label="Filter by item type"><option value="all">All prompts</option><option value="question">Questions</option><option value="exercise">Exercises</option><option value="saved">Saved answers</option></select></div>
    <div className="practice-layout"><aside className="practice-prompt-list"><div className="practice-list-heading">{number.format(filtered.length)} prompts</div>{filtered.slice(0, 100).map((entry) => <button key={entry.id} className={`practice-prompt ${selected?.id === entry.id ? 'practice-prompt--selected' : ''}`} onClick={() => setSelectedId(entry.id)}><span className="practice-prompt-title">{entry.text}</span><small>{entry.topic.title} · {entry.section.title}</small><span className={`practice-tag ${itemData[entry.id]?.answer?.trim() ? 'practice-tag--saved' : ''}`}>{itemData[entry.id]?.answer?.trim() ? 'Draft saved' : completed.has(entry.id) ? 'Completed' : entry.kind}</span></button>)}{filtered.length > 100 && <p className="practice-list-more">Refine your search to see more prompts.</p>}{!filtered.length && <p className="practice-list-more">No prompts match these filters.</p>}</aside>
      <section className="practice-editor">{selected ? <><div className="practice-topic-label">{selected.section.title} <span>›</span> {clean(selected.topic.title)}</div><span className="practice-kind">{selected.kind}</span><h2>{selected.text}</h2><p className="practice-guidance">Use this space to write a structured answer, explain tradeoffs, or outline a solution.</p><label htmlFor="practice-answer">Your answer or solution</label><textarea id="practice-answer" rows={13} value={itemData[selected.id]?.answer || ''} onChange={(event) => onSaveAnswer(selected.id, event.target.value)} placeholder="Start with the key idea, then explain how you would apply it, what can go wrong, and how you would validate the result…"/><div className="practice-save-note">Saved automatically to this learner profile on this device.</div></> : <div className="feature-empty">Choose a prompt to begin practicing.</div>}</section>
    </div>
  </div>;
}

export function CodingPracticeView({ catalog, itemData, onSaveCoding }) {
  const [sectionId, setSectionId] = useState('all');
  const [topicId, setTopicId] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [runnerAvailable, setRunnerAvailable] = useState(false);
  const [runnerStatus,setRunnerStatus]=useState('Checking local runner…');
  const [runnerRunning, setRunnerRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [runResults, setRunResults] = useState([]);
  useEffect(() => {
    fetch('http://127.0.0.1:5174/api/health').then((response) => response.ok ? response.json() : null).then((result) => {const available=Boolean(result?.available);setRunnerAvailable(available);setRunnerStatus(available?'Local Docker runner ready · code stays on this machine':result?.reason || 'Start both services with npm run dev:all.');}).catch(() => {setRunnerAvailable(false);setRunnerStatus('Start both services with npm run dev:all.');});
  }, []);
  const exercises = useMemo(() => catalog.sections.flatMap((section) =>
    section.topics.flatMap((topic) => topic.items.filter((item) => item.kind === 'Exercise').map((item) => ({ ...item, section, topic })))
  ).sort((a,b) => Number(b.topic.track === 'striver-a2z') - Number(a.topic.track === 'striver-a2z')), [catalog]);
  const topicOptions = catalog.sections.filter((section) => sectionId === 'all' || section.id === sectionId).flatMap((section) => section.topics.filter((topic) => topic.items.some((item) => item.kind === 'Exercise')).map((topic) => ({id:topic.id,title:topic.title,sectionId:section.id,track:topic.track}))).sort((a,b) => Number(b.track === 'striver-a2z') - Number(a.track === 'striver-a2z'));
  const filtered = exercises.filter((entry) => (sectionId === 'all' || entry.section.id === sectionId) && (topicId === 'all' || entry.topic.id === topicId) && (difficulty === 'all' || entry.difficulty === difficulty) && (!query || entry.text.toLowerCase().includes(query.toLowerCase()) || entry.topic.title.toLowerCase().includes(query.toLowerCase())));
  const selected = filtered.find((entry) => entry.id === selectedId) || filtered[0];
  const saved = selected ? (itemData[selected.id]?.coding || {testCases:selected.testCases || []}) : {};
  const suggestedLanguage = selected?.section.title.includes('Database') ? 'SQL' : selected?.section.title.includes('HLD') ? 'Design notes' : 'Go';
  const language = saved.language || suggestedLanguage;
  const fileExtension = ({Go:'go',SQL:'sql',Bash:'sh',YAML:'yaml',JSON:'json','Design notes':'md'})[language] || 'txt';
  function update(patch) { onSaveCoding(selected.id, { ...saved, ...patch }); }
  function addCase() { update({ testCases:[...(saved.testCases || []), { input:'', expected:'', passed:false }] }); }
  function updateCase(index, patch) { update({ testCases:(saved.testCases || []).map((testCase,caseIndex) => caseIndex === index ? { ...testCase, ...patch } : testCase) }); }
  function removeCase(index) { update({ testCases:(saved.testCases || []).filter((_,caseIndex) => caseIndex !== index) }); }
  function runSqlCase(testCase) {
    return new Promise((resolve) => {
      const worker = new Worker(new URL('./sqlWorker.js', import.meta.url), { type:'module' });
      const timer = window.setTimeout(() => { worker.terminate(); resolve({ error:'Query timed out after 5 seconds.' }); }, 5000);
      worker.onmessage = ({ data }) => { window.clearTimeout(timer); worker.terminate(); resolve(data); };
      worker.onerror = (event) => { window.clearTimeout(timer); worker.terminate(); resolve({ error:event.message || 'Could not start the SQL runner.' }); };
      worker.postMessage({ setup:testCase.input || '', query:saved.solution || '' });
    });
  }
  async function runCases() {
    setRunnerRunning(true); setRunError(''); setRunResults([]);
    try {
      if (language === 'SQL') {
        const cases = saved.testCases || [];
        const results = [];
        for (const testCase of cases) {
          const result = await runSqlCase(testCase);
          if (result.error) results.push({ error:result.error });
          else {
            let passed = result.output.trim() === (testCase.expected || '').trim();
            if (!passed && testCase.expected?.trim()) {
              try { passed = JSON.stringify(JSON.parse(result.output)) === JSON.stringify(JSON.parse(testCase.expected)); } catch { /* Compare text as entered. */ }
            }
            results.push({ passed, actual:result.output + (result.truncated ? ' (first 500 rows)' : ''), exitCode:0 });
          }
        }
        setRunResults(results);
        if (results.length === cases.length && results.every((entry) => !entry.error)) update({testCases:cases.map((testCase,index) => ({...testCase,passed:Boolean(results[index]?.passed)}))});
        return;
      }
      const response=await fetch('http://127.0.0.1:5174/api/run/go',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:saved.solution || '',testCases:saved.testCases || []})});
      const result=await response.json();
      if(!response.ok) {if(response.status===503){setRunnerAvailable(false);setRunnerStatus(result.error || 'Docker Desktop is not available.');}throw new Error(result.error || 'The runner rejected this request.');}
      const results=result.results || [];
      setRunResults(results);
      if(results.length === (saved.testCases || []).length && results.every((entry) => !entry.error)) update({testCases:(saved.testCases || []).map((testCase,index) => ({...testCase,passed:Boolean(results[index]?.passed)}))});
      const dockerError=results.find((entry) => entry.error)?.error;
      if(dockerError) setRunError(dockerError);
    } catch(error) { setRunError(error.message || 'The local runner could not be reached.'); }
    finally { setRunnerRunning(false); }
  }
  function downloadSolution() {
    const blob = new Blob([saved.solution || ''], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href=url; link.download=`${selected.id}.${fileExtension}`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  return <div className="page-content feature-page">
    <FeatureHeader eyebrow="CODING PRACTICE" title="Solve the problems yourself" subtitle="Work through guide exercises and the A2Z-aligned DSA progression. Save Go solutions, use sample cases, and track your practice." /><p className="a2z-sheet-link"><a href="https://takeuforward.org/prep-hub/strivers-a2z-dsa-sheet" target="_blank" rel="noreferrer">Open the official Striver A2Z DSA sheet ↗</a><span>Original local prompts are provided for practice; use the sheet for its full statements, hints, and editorials.</span></p>
    <div className="coding-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a coding exercise" aria-label="Search coding exercises"/><select value={sectionId} onChange={(event) => {setSectionId(event.target.value);setTopicId('all');setSelectedId(null);}} aria-label="Filter coding exercises by section"><option value="all">All sections</option>{catalog.sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}</select><select value={topicId} onChange={(event) => {setTopicId(event.target.value);setSelectedId(null);}} aria-label="Filter by problem topic"><option value="all">All problem topics</option>{topicOptions.map((topic) => <option key={topic.id} value={topic.id}>{topic.track === 'striver-a2z' ? 'A2Z · ' : ''}{topic.title}</option>)}</select><select value={difficulty} onChange={(event) => {setDifficulty(event.target.value);setSelectedId(null);}} aria-label="Filter by difficulty"><option value="all">All difficulties</option><option>Easy</option><option>Medium</option><option>Hard</option></select><span>{number.format(filtered.length)} exercises</span></div>
    <div className="coding-layout"><aside className="coding-list"><strong className="coding-list-title">Exercise library</strong>{filtered.slice(0,100).map((entry) => <button key={entry.id} className={`coding-exercise ${entry.id === selected?.id ? 'coding-exercise--active' : ''}`} onClick={() => {setSelectedId(entry.id);setRunResults([]);setRunError('');}}><span>{entry.text}</span><small>{entry.topic.title} · {entry.difficulty || 'Core'} · {entry.section.title}</small><b>{itemData[entry.id]?.coding?.solution?.trim() ? 'Solution saved' : 'Start'}</b></button>)}{filtered.length > 100 && <p>Search or choose a topic to narrow the exercise list.</p>}</aside>
      {selected ? <main className="coding-workspace"><div className="coding-breadcrumb">{selected.section.title} <span>›</span> {selected.topic.title}</div><div className="coding-prompt-heading"><span className="coding-language">{language}</span>{selected.difficulty && <span className={`coding-difficulty coding-difficulty--${selected.difficulty.toLowerCase()}`}>{selected.difficulty}</span>}<span className="coding-done-mark">{saved.solution?.trim() ? 'Draft saved' : 'Not started'}</span></div><h2>{selected.text}</h2>{selected.description && <p className="coding-description">{selected.description}</p>}{selected.sourceUrl && <a className="coding-source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">Open this topic in the official A2Z sheet ↗</a>}{selected.pattern && <ProblemCoach item={selected}/>}<div className="coding-editor-heading"><label htmlFor="coding-solution">Your solution</label><select aria-label="Solution language" value={language} onChange={(event) => update({language:event.target.value})}><option>Go</option><option>SQL</option><option>Bash</option><option>YAML</option><option>JSON</option><option>Design notes</option></select><button className="secondary-button" onClick={downloadSolution}>Download {fileExtension}</button></div><textarea id="coding-solution" className="coding-editor" spellCheck="false" value={saved.solution || ''} onChange={(event) => {update({solution:event.target.value});setRunResults([]);}} placeholder={language === 'Go' ? 'package main\n\n// Write your solution here\n' : language === 'SQL' ? '-- Write your query here\n' : '## Approach\n\nDescribe the design and tradeoffs here.'}/><section className="coding-tests"><div className="coding-tests-heading"><div><h3>Example test cases</h3><p>{language === 'SQL' ? 'Put CREATE TABLE and INSERT statements in Input. Expected output is a JSON array of rows.' : 'Write inputs and expected results, then run them against your Go program.'}</p></div><div className="coding-test-actions">{(language === 'Go' || language === 'SQL') && <button className="primary-button run-cases-button" disabled={(language === 'Go' && !runnerAvailable) || runnerRunning || !(saved.testCases || []).length} onClick={runCases}>{runnerRunning ? 'Running…' : language === 'SQL' ? '▶ Run SQL' : runnerAvailable ? '▶ Run cases' : 'Runner offline'}</button>}<button className="secondary-button" onClick={addCase}>+ Add case</button></div></div>{language === 'Go' && <div className={`runner-status ${runnerAvailable ? 'runner-status--ready' : ''}`}>{runnerStatus}</div>}{language === 'SQL' && <div className="runner-status runner-status--ready">SQLite runs in a temporary browser worker · each query stops after 5 seconds</div>}{runError && <div className="runner-error" role="status">{runError}</div>}{(saved.testCases || []).length ? saved.testCases.map((testCase,index) => <article className="coding-test-case" key={index}><div className="coding-test-title"><strong>Case {index+1}</strong><button className="case-remove" onClick={() => removeCase(index)} aria-label={`Remove test case ${index+1}`}>Remove</button></div><label>{language === 'SQL' ? 'Setup SQL (schema and rows)' : 'Input'}<textarea value={testCase.input} rows={2} onChange={(event) => {updateCase(index,{input:event.target.value,passed:false});setRunResults([]);}} placeholder={language === 'SQL' ? 'CREATE TABLE trades (id INTEGER, symbol TEXT);\nINSERT INTO trades VALUES (1, \'ABC\');' : 'Example input'}/></label><label>Expected output<textarea value={testCase.expected} rows={2} onChange={(event) => {updateCase(index,{expected:event.target.value,passed:false});setRunResults([]);}} placeholder={language === 'SQL' ? '[{"id":1,"symbol":"ABC"}]' : 'Expected result'}/></label><div className={`case-result ${runResults[index]?.passed ? 'case-result--passed' : runResults[index] && !runResults[index].error ? 'case-result--failed' : ''}`}>{runResults[index] ? runResults[index].error ? `Runner error: ${runResults[index].error}` : runResults[index].exitCode !== 0 ? `Compiler/runtime output: ${runResults[index].stderr || '(no output)'}` : `Actual output: ${runResults[index].actual || '(empty)'}` : ''}</div><label className="case-passed"><input type="checkbox" checked={Boolean(testCase.passed)} onChange={(event) => updateCase(index,{passed:event.target.checked})}/> I ran this case and it passed</label></article>) : <div className="coding-no-tests">Add examples from the prompt or cases you want to verify.</div>}</section><div className="coding-run-note"><strong>{language === 'SQL' ? 'SQLite practice runner' : 'Run locally in Docker'}</strong><span>{language === 'SQL' ? 'SQL executes in an in-memory SQLite database inside a disposable Web Worker. It has no access to your files or network.' : 'Go programs run in an isolated container with network access disabled, memory/CPU/PID limits, no Linux capabilities, and a read-only source folder.'}</span></div></main> : <div className="feature-empty">No exercises match. Try changing the search or section.</div>}</div>
  </div>;
}

export function MockInterviewView({ catalog, interview, history, now, onStart, onUpdate, onFinish }) {
  const [sectionIds, setSectionIds] = useState(() => catalog.sections.map((section) => section.id));
  const [questionCount, setQuestionCount] = useState(5);
  const [duration, setDuration] = useState(30);
  const [reviewId, setReviewId] = useState(null);
  const questions = interview?.questions || [];
  const current = questions[interview?.currentIndex || 0];
  const remaining = interview ? Math.max(0, Math.ceil((interview.startedAt + interview.durationMs - now) / 1000)) : 0;
  if (reviewId) {
    const session = history.find((entry) => entry.id === reviewId);
    const scored = session?.questions.map((question) => rubricAverage(question.rubric)).filter(Boolean) || [];
    const overall = scored.length ? (scored.reduce((sum,value) => sum+value,0)/scored.length).toFixed(1) : '—';
    return <div className="page-content feature-page"><FeatureHeader eyebrow="MOCK INTERVIEW REVIEW" title="Review your interview" subtitle="Compare each answer against the same five interview criteria."/><div className="interview-score-banner"><span>Average rubric score</span><strong>{overall}<small> / 5</small></strong><span>{scored.length} of {session?.questions.length || 0} answers rated</span></div><button className="back-link feature-back" onClick={() => setReviewId(null)}>‹ BACK TO MOCK INTERVIEWS</button>{session?.questions.map((question, index) => <article className="review-answer-card" key={`${question.itemId}-${index}`}><span>Question {index + 1} · Overall self-rating {question.rating || 'Not rated'}/5</span><h3>{question.text}</h3><p>{question.answer || 'No answer saved.'}</p><RubricSummary rubric={question.rubric}/></article>)}</div>;
  }
  if (interview) return <div className="page-content feature-page"><FeatureHeader eyebrow="MOCK INTERVIEW · IN PROGRESS" title="Think out loud. Be specific." subtitle="Treat each prompt like a real interview. Your answer is saved as you go."/><section className="mock-session-card"><div className="mock-session-top"><span>Question {(interview.currentIndex || 0) + 1} of {questions.length}</span><strong className={remaining < 60 ? 'mock-time-low' : ''}>{String(Math.floor(remaining / 60)).padStart(2,'0')}:{String(remaining % 60).padStart(2,'0')} remaining</strong></div><div className="mock-progress"><i style={{width:`${((interview.currentIndex || 0) / questions.length) * 100}%`}}/></div>{current ? <><span className="practice-kind">{current.kind} · {current.sectionTitle}</span><h2 className="mock-question">{current.text}</h2><label className="mock-answer-label" htmlFor="mock-answer">Your answer</label><textarea id="mock-answer" rows={10} value={interview.answers?.[current.itemId]?.text || ''} onChange={(event) => onUpdate({ type:'answer', itemId:current.itemId, value:event.target.value })} placeholder="Structure your response. Include assumptions, tradeoffs, failure handling, and how you would verify the design…"/><div className="mock-self-rating"><label htmlFor="mock-rating">Overall, how strong was that answer?</label><select id="mock-rating" value={interview.answers?.[current.itemId]?.rating || ''} onChange={(event) => onUpdate({ type:'rating', itemId:current.itemId, value:Number(event.target.value) })}><option value="">Choose an overall rating</option><option value="1">1 · Needs work</option><option value="2">2 · Weak</option><option value="3">3 · Developing</option><option value="4">4 · Strong</option><option value="5">5 · Interview-ready</option></select></div><RubricControls value={interview.answers?.[current.itemId]?.rubric || {}} onChange={(dimension,value) => onUpdate({type:'rubric',itemId:current.itemId,dimension,value})}/><div className="mock-actions"><button className="text-button" onClick={() => onFinish(false)}>End interview</button>{interview.currentIndex < questions.length - 1 ? <button className="primary-button" onClick={() => onUpdate({ type:'next' })}>Next question →</button> : <button className="primary-button" onClick={() => onFinish(true)}>Finish and review</button>}</div></> : null}</section></div>;
  const pool = catalog.sections.filter((section) => sectionIds.includes(section.id)).flatMap((section) => section.topics.flatMap((topic) => topic.items.filter((item) => item.kind === 'Question').map((item) => ({ id:item.id, text:item.text, kind:item.kind, sectionId:section.id, sectionTitle:section.title, topicTitle:topic.title }))));
  return <div className="page-content feature-page"><FeatureHeader eyebrow="INTERVIEW PRACTICE" title="Mock interview" subtitle="Build a timed interview from selected curriculum sections, then review your answers and rate yourself."/><section className="mock-setup-card"><h2>Set up a session</h2><label>Choose sections</label><div className="section-pick-grid">{catalog.sections.map((section) => <label key={section.id}><input type="checkbox" checked={sectionIds.includes(section.id)} onChange={(event) => setSectionIds((current) => event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))}/><span>{section.title}</span></label>)}</div><div className="mock-setup-options"><label>Questions<select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}><option value="5">5 questions</option><option value="10">10 questions</option><option value="15">15 questions</option></select></label><label>Time limit<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label></div><p>{number.format(pool.length)} available questions across the selected sections.</p><button className="primary-button" disabled={!pool.length} onClick={() => onStart(pool, questionCount, duration)}>Start mock interview →</button></section>{history.length > 0 && <section className="mock-history"><h2>Past interviews</h2>{[...history].reverse().slice(0,8).map((session) => <button key={session.id} onClick={() => setReviewId(session.id)}><span><strong>{new Date(session.endedAt).toLocaleString()}</strong><small>{session.questions.length} questions · {session.durationMinutes} min</small></span><b>Review →</b></button>)}</section>}</div>;
}

export function InsightsView({ catalog, itemData, completed, sessions, mockHistory, reviewItems, personalNotes = [] }) {
  const items = catalog.sections.flatMap((section) => section.topics.flatMap((topic) => topic.items.map((item) => ({ ...item, section, topic, data:itemData[item.id] || {} }))));
  const savedAnswers = items.filter((item) => item.data.answer?.trim()).length;
  const notes = items.filter((item) => item.data.note?.trim()).length + personalNotes.length;
  const mockRatings = mockHistory.flatMap((session) => session.questions.map((question) => rubricAverage(question.rubric) || Number(question.rating)).filter(Boolean));
  const averageMockRating = mockRatings.length ? (mockRatings.reduce((sum,rating) => sum + rating,0) / mockRatings.length).toFixed(1) : '—';
  const rubricMeans = rubricCriteria.map(([key,label]) => {
    const scores = mockHistory.flatMap((session) => session.questions.map((question) => Number(question.rubric?.[key])).filter(Boolean));
    return {label, score:scores.length ? scores.reduce((sum,value) => sum+value,0)/scores.length : 0, rated:scores.length};
  });
  const uncertain = items.filter((item) => item.data.confidence === 'learning' || item.data.confidence === 'practicing');
  const grouped = new Map();
  for (const item of uncertain) {
    const key = `${item.section.id}:${item.topic.id}`;
    const current = grouped.get(key) || { title:item.topic.title, section:item.section.title, count:0, total:item.topic.items.length };
    current.count += 1;
    grouped.set(key,current);
  }
  const weakTopics = [...grouped.values()].sort((a,b) => b.count-a.count).slice(0,8);
  const confidenceCounts = ['learning','practicing','confident'].map((value) => ({ value, count:items.filter((item) => item.data.confidence === value).length }));
  const minutesByDay = Array.from({length:7},(_,index) => {
    const date = new Date(); date.setDate(date.getDate() - (6-index));
    const key = date.toLocaleDateString('en-CA');
    return { label:date.toLocaleDateString(undefined,{weekday:'short'}), minutes:sessions.filter((session) => session.date === key).reduce((sum,session) => sum+session.minutes,0) };
  });
  const maxMinutes = Math.max(1,...minutesByDay.map((day) => day.minutes));
  return <div className="page-content feature-page"><FeatureHeader eyebrow="PROGRESS INSIGHTS" title="See what needs attention" subtitle="Use confidence ratings, review flags, and study history to focus your next session."/><div className="insight-summary-grid"><InsightMetric value={number.format(completed.size)} label="Items completed"/><InsightMetric value={number.format(savedAnswers)} label="Practice answers saved"/><InsightMetric value={number.format(notes)} label="Notes saved"/><InsightMetric value={number.format(reviewItems.length)} label="Reviews due"/><InsightMetric value={averageMockRating} label="Average mock rubric"/></div><div className="insight-content-grid"><section className="insight-card"><h2>Confidence levels</h2><p>Rated items across your curriculum</p>{confidenceCounts.map(({value,count}) => <div className="confidence-bar-row" key={value}><span>{value === 'learning' ? 'Learning' : value === 'practicing' ? 'Practicing' : 'Confident'}</span><div><i style={{width:`${items.length ? count / items.length * 100 : 0}%`}}/></div><b>{count}</b></div>)}</section><section className="insight-card"><h2>Study time · last 7 days</h2><p>Recorded focused sessions</p><div className="study-week-chart">{minutesByDay.map((day) => <div key={day.label}><span>{day.minutes ? `${day.minutes}m` : ''}</span><i style={{height:`${Math.max(4,day.minutes/maxMinutes*90)}px`}}/><small>{day.label}</small></div>)}</div></section><section className="insight-card insight-card--wide"><h2>Mock interview rubric</h2><p>Average criterion scores across rated mock answers</p>{rubricMeans.some((metric) => metric.rated) ? rubricMeans.map((metric) => <div className="rubric-insight-row" key={metric.label}><span>{metric.label}</span><div><i style={{width:`${metric.score/5*100}%`}}/></div><b>{metric.rated ? metric.score.toFixed(1) : '—'}</b></div>) : <div className="feature-empty">Complete a mock interview rubric to see your answer strengths here.</div>}</section><section className="insight-card insight-card--wide"><h2>Topics to revisit</h2><p>Areas with items rated Learning or Practicing</p>{weakTopics.length ? weakTopics.map((topic) => <div className="weak-topic-row" key={`${topic.section}-${topic.title}`}><span><strong>{clean(topic.title)}</strong><small>{topic.section}</small></span><span>{topic.count} developing</span></div>) : <div className="feature-empty">Add confidence ratings to see your focus areas here.</div>}</section></div></div>;
}

export function BackupView({ profile, onImport }) {
  const [message, setMessage] = useState('');
  function exportJson() {
    const blob = new Blob([JSON.stringify({ format:'backend-atlas-backup', version:1, exportedAt:new Date().toISOString(), profile },null,2)],{type:'application/json'});
    download(blob,`backend-atlas-${slug(profile.name)}-backup.json`);
    setMessage('Backup downloaded. Keep it somewhere you can find it later.');
  }
  function exportCsv() {
    const rows = [['Item ID','Note','Practice answer','Confidence','Review date']];
    for (const [id,data] of Object.entries(profile.itemData || {})) rows.push([id,data.note || '',data.answer || '',data.confidence || '',data.reviewAt ? new Date(data.reviewAt).toISOString() : '']);
    for (const note of profile.notes || []) rows.push([`personal-note:${note.id}`,`${note.title || 'Untitled note'}\n${note.body || ''}`,'',note.tags || '',note.updatedAt || '']);
    download(new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),`backend-atlas-${slug(profile.name)}-notes.csv`);
    setMessage('Notes and practice answers downloaded as CSV.');
  }
  async function importFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== 'backend-atlas-backup' || !parsed.profile || !Array.isArray(parsed.profile.completed) || typeof parsed.profile.itemData !== 'object') throw new Error('That file is not a valid Backend Atlas backup.');
      onImport(parsed.profile);
      setMessage(`Imported backup for ${parsed.profile.name || 'learner'}.`);
    } catch (error) { setMessage(error.message || 'Could not read this backup file.'); }
  }
  return <div className="page-content feature-page"><FeatureHeader eyebrow="PORTABLE DATA" title="Back up your learning" subtitle="Download a copy of this learner profile or restore it in another browser. Your data stays under your control."/><div className="backup-grid"><article className="backup-card"><span className="backup-card-icon">JSON</span><h2>Full profile backup</h2><p>Includes completion, notes, confidence, review reminders, study sessions, saved answers, and mock interviews.</p><button className="primary-button" onClick={exportJson}>Download JSON backup</button></article><article className="backup-card"><span className="backup-card-icon">CSV</span><h2>Notes and answers</h2><p>Export the text you have written in a spreadsheet-friendly format.</p><button className="secondary-button" onClick={exportCsv}>Download notes CSV</button></article><article className="backup-card"><span className="backup-card-icon">↥</span><h2>Restore a backup</h2><p>Choose a Backend Atlas JSON backup. It replaces data for the current local profile.</p><label className="secondary-button import-button">Choose backup file<input type="file" accept="application/json,.json" onChange={(event) => { const file=event.target.files?.[0]; if(file && window.confirm('Replace this profile with the selected backup?')) importFile(file); event.target.value=''; }}/></label></article></div>{message && <p className="backup-message" role="status">{message}</p>}</div>;
}

export function CloudSyncPanel({ store, onRestore, visible = true }) {
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [remote, setRemote] = useState(null);
  const [linked, setLinked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [lastSync, setLastSync] = useState('');
  const serialized = stableStringify(store);
  const syncKey = session?.user?.id ? `backend-atlas.synced.${session.user.id}` : '';

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user) { setRemote(null); setLinked(false); return; }
    let cancelled = false;
    setBusy(true); setConflict(false);
    supabase.from('learner_backups').select('payload,updated_at').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) setMessage(`Could not read cloud data: ${error.message}`);
      setRemote(data || null);
      const isLinked = localStorage.getItem(syncKey) === 'yes';
      setLinked(isLinked);
      setLastSync(data?.updated_at || '');
      if (isLinked && data?.payload && data.updated_at && stableStringify(data.payload) !== serialized) {
        const previousSync = localStorage.getItem(`${syncKey}.time`);
        if (previousSync && new Date(data.updated_at).getTime() > new Date(previousSync).getTime()) setConflict(true);
      }
      if (!data) setMessage('Signed in. Upload this device’s learning data to start syncing.');
      else if (!isLinked) setMessage('Cloud data is available. Choose which copy to keep on this device.');
      else setMessage(`Connected · last cloud update ${new Date(data.updated_at).toLocaleString()}`);
      setBusy(false);
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);


  async function upload(force = false) {
    if (!supabase || !session?.user) return;
    setBusy(true);
    const { data: current, error: readError } = await supabase.from('learner_backups').select('payload,updated_at').eq('user_id', session.user.id).maybeSingle();
    if (readError) { setMessage(`Could not check cloud version: ${readError.message}`); setBusy(false); return; }
    if (!force && lastSync && current?.updated_at && new Date(current.updated_at).getTime() > new Date(lastSync).getTime()) {
      setConflict(true); setRemote(current); setMessage('Cloud data changed on another device. Choose which version to keep before syncing.'); setBusy(false); return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const payload = store;
    const { error } = await supabase.from('learner_backups').upsert({ user_id:userData.user.id, payload, updated_at:new Date().toISOString() }, { onConflict:'user_id' });
    if (error) setMessage(`Sync failed: ${error.message}`);
    else {
      const savedAt = new Date().toISOString();
      localStorage.setItem(syncKey, 'yes'); localStorage.setItem(`${syncKey}.time`, savedAt); setLinked(true); setConflict(false); setLastSync(savedAt);
      setRemote({ payload, updated_at:savedAt }); setMessage(`Synced this device · ${new Date(savedAt).toLocaleTimeString()}`);
    }
    setBusy(false);
  }

  function restoreCloud() {
    if (!remote?.payload) return;
    if (!window.confirm('Replace all learner profiles on this device with the cloud copy?')) return;
    onRestore(remote.payload); localStorage.setItem(syncKey, 'yes'); localStorage.setItem(`${syncKey}.time`, remote.updated_at || new Date().toISOString()); setLinked(true); setConflict(false); setLastSync(remote.updated_at || ''); setMessage('Cloud data restored to this device. Syncing is on.');
  }

  useEffect(() => {
    if (!supabase || !session?.user || !linked || busy || conflict) return;
    const timer = window.setTimeout(() => { if (serialized !== stableStringify(remote?.payload || null)) upload(); }, 1300);
    return () => window.clearTimeout(timer);
  }, [serialized, linked, session?.user?.id, busy, conflict, remote?.updated_at]);

  useEffect(() => {
    if (!supabase || !session?.user || !linked) return;
    const timer = window.setInterval(async () => {
      const { data } = await supabase.from('learner_backups').select('payload,updated_at').eq('user_id', session.user.id).maybeSingle();
      if (!data || !data.updated_at || data.updated_at === lastSync) return;
      if (stableStringify(data.payload) === stableStringify(store)) { setLastSync(data.updated_at); return; }
      if (serialized !== stableStringify(remote?.payload || null)) { setRemote(data); setConflict(true); }
      else { onRestore(data.payload); setRemote(data); setLastSync(data.updated_at); setMessage(`Updated from cloud · ${new Date(data.updated_at).toLocaleTimeString()}`); }
    }, 30000);
    return () => window.clearInterval(timer);
  }, [linked, session?.user?.id, lastSync, serialized]);

  const panel = !supabase ? <section className="sync-panel"><div className="sync-panel-heading"><span className="backup-card-icon">☁</span><div><h2>Cloud sync with Supabase</h2><p>Sign in once to keep your learner profiles available across devices.</p></div></div><div className="sync-setup"><strong>Connect your Supabase project</strong><p>Add the project URL and publishable key to <code>.env.local</code>, then restart the dev server. Never put a service role key in the browser.</p><pre>VITE_SUPABASE_URL=https://your-project.supabase.co<br/>VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key<br/>VITE_ADMIN_EMAIL=admin@example.com</pre><p>Run <code>supabase/schema.sql</code>, create one Auth user, disable public sign-ups, and add that user to the admin allowlist.</p></div></section>
    : <section className="sync-panel"><div className="sync-panel-heading"><span className="backup-card-icon">☁</span><div><h2>Cloud sync with Supabase</h2><p>Your learning data stays private to your signed-in account.</p></div></div>{session?.user ? <><div className="sync-account"><span>Signed in as <strong>{session.user.email}</strong></span><button className="secondary-button" onClick={() => supabase.auth.signOut()}>Sign out</button></div>{!linked && <div className="sync-choice"><p>{remote?.payload ? 'This device has local learning data and the account has cloud data.' : 'No cloud copy exists yet. Upload this device’s data to start cross-device sync.'}</p>{remote?.payload && <button className="secondary-button" disabled={busy} onClick={restoreCloud}>Use cloud copy on this device</button>}<button className="primary-button" disabled={busy} onClick={() => upload(true)}>Upload this device’s data</button></div>}{linked && <div className="sync-actions"><button className="primary-button" disabled={busy} onClick={() => upload()}>{busy ? 'Syncing…' : 'Sync now'}</button><span>{lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : 'Syncing changes automatically'}</span></div>}{conflict && <div className="sync-conflict"><strong>Changes found on another device</strong><p>Choose the complete cloud snapshot or keep this device’s snapshot.</p><button className="secondary-button" onClick={restoreCloud}>Use cloud copy</button><button className="primary-button" onClick={() => upload(true)}>Keep this device</button></div>}{message && <p className="sync-message" role="status">{message}</p>}</> : <div className="sync-signin"><p>Sign in through the Backend Atlas admin login page to manage cloud sync.</p>{message && <p className="sync-message" role="status">{message}</p>}</div>}</section>;
  return <div className="page-content feature-page cloud-sync-host" style={{ display:visible ? undefined : 'none', paddingTop:0 }}>{panel}</div>;
}

export function DatabaseCheckView() {
  const [status, setStatus] = useState('idle');
  const [detail, setDetail] = useState('Run a read-only check against the Supabase database API.');
  const [latency, setLatency] = useState(null);
  const [checkedAt, setCheckedAt] = useState('');
  async function check() {
    if (!supabase) { setStatus('missing'); setDetail('Supabase is not configured. Add the URL and publishable key, then restart the app.'); return; }
    setStatus('checking'); setDetail('Checking the Supabase API…'); setLatency(null);
    const started = performance.now();
    const { data, error } = await supabase.rpc('backend_atlas_healthcheck');
    const elapsed = Math.round(performance.now() - started);
    setLatency(elapsed); setCheckedAt(new Date().toLocaleString());
    if (error) { setStatus('error'); setDetail(`Database API check failed: ${error.message}. Apply supabase/schema.sql and verify the project URL and key.`); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setStatus('connected'); setDetail(`Database is reachable (${data}). Sign in to check private learner data access.`); return; }
    const { error: tableError } = await supabase.from('learner_backups').select('user_id').limit(1);
    if (tableError) { setStatus('partial'); setDetail(`Database is reachable, but private learner storage could not be read: ${tableError.message}. Check the table and row-level policies.`); return; }
    setStatus('connected'); setDetail('Database is reachable and the signed-in account can access its protected learner data.');
  }
  useEffect(() => { check(); }, []);
  return <div className="page-content feature-page"><FeatureHeader eyebrow="SUPABASE CONNECTION" title="Database status" subtitle="Check the database API, project configuration, and signed-in access to learner data."/><section className={`db-status-card db-status-card--${status}`}><div className="db-status-indicator"><i/>{status === 'checking' ? 'Checking' : status === 'connected' ? 'Connected' : status === 'partial' ? 'Partially connected' : status === 'error' || status === 'missing' ? 'Not connected' : 'Not checked'}</div><p>{detail}</p><div className="db-status-meta">{latency !== null && <span>Response: {latency} ms</span>}{checkedAt && <span>Last checked: {checkedAt}</span>}</div><button className="primary-button" disabled={status === 'checking'} onClick={check}>{status === 'checking' ? 'Checking…' : 'Check connection'}</button></section><section className="db-check-details"><h2>What this checks</h2><ul><li>Supabase project URL and browser-safe publishable key</li><li>A read-only PostgreSQL function through the Supabase API</li><li>Signed-in access to the learner backup table and its row-level security</li></ul><p>This page never writes or changes your database.</p></section></div>;
}

export function NotesView({ notes, onChange }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const filtered = notes.filter((note) => `${note.title} ${note.body} ${note.tags || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => Number(Boolean(b.pinned))-Number(Boolean(a.pinned)) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const selected = filtered.find((note) => note.id === selectedId) || filtered[0];
  useEffect(() => { setDraft(selected ? { ...selected } : null); setSelectedId(selected?.id || null); }, [selected?.id]);
  function createNote() {
    const note = { id:`note-${Date.now()}`, title:'Untitled note', body:'', tags:'', pinned:false, updatedAt:new Date().toISOString() };
    onChange([note,...notes]); setSelectedId(note.id); setDraft(note);
  }
  function saveNote() {
    if (!draft) return;
    const saved = { ...draft, title:draft.title.trim() || 'Untitled note', updatedAt:new Date().toISOString() };
    onChange(notes.map((note) => note.id === saved.id ? saved : note)); setDraft(saved);
  }
  function deleteNote() {
    if (!selected || !window.confirm(`Delete “${selected.title}”?`)) return;
    onChange(notes.filter((note) => note.id !== selected.id)); setSelectedId(null); setDraft(null);
  }
  return <div className="page-content feature-page"><FeatureHeader eyebrow="PERSONAL KNOWLEDGE BASE" title="Notes" subtitle="Keep interview explanations, trading-system decisions, and revision notes alongside your curriculum."/><div className="notes-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes"/><button className="primary-button" onClick={createNote}>+ New note</button></div><div className="notes-layout"><aside className="notes-list">{filtered.map((note) => <button key={note.id} className={`note-list-item ${selected?.id === note.id ? 'note-list-item--active' : ''}`} onClick={() => {setSelectedId(note.id);setDraft({...note});}}><strong>{note.pinned ? '★ ' : ''}{note.title || 'Untitled note'}</strong><span>{note.body?.slice(0,105) || 'No text yet'}</span><small>{note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : 'New note'}</small></button>)}{!filtered.length && <p className="notes-empty">No notes yet. Create one to start your knowledge base.</p>}</aside>{draft ? <section className="note-editor"><div className="note-editor-actions"><label className="note-pin"><input type="checkbox" checked={Boolean(draft.pinned)} onChange={(event) => setDraft({...draft,pinned:event.target.checked})}/> Pin note</label><button className="secondary-button" onClick={deleteNote}>Delete</button></div><input className="note-title-input" value={draft.title} onChange={(event) => setDraft({...draft,title:event.target.value})} placeholder="Note title"/><input className="note-tags-input" value={draft.tags || ''} onChange={(event) => setDraft({...draft,tags:event.target.value})} placeholder="Tags, separated by commas"/><textarea className="note-body-input" value={draft.body || ''} onChange={(event) => setDraft({...draft,body:event.target.value})} placeholder="Write your notes here…"/><div className="note-save-row"><span>{draft.updatedAt ? `Last saved ${new Date(draft.updatedAt).toLocaleString()}` : 'Unsaved note'}</span><button className="primary-button" onClick={saveNote}>Save note</button></div></section> : <section className="note-editor feature-empty">Select a note or create a new one.</section>}</div></div>;
}

export function FlashcardsView({ catalog, itemData, notes, schedule, onSchedule, customCards, onCustomCards }) {
  const [sectionId, setSectionId] = useState('all');
  const [queue, setQueue] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [cardDraft, setCardDraft] = useState(null);
  const now = Date.now();
  const cards = useMemo(() => {
    const curriculum = catalog.sections.flatMap((section) => section.topics.flatMap((topic) => topic.items
      .filter((item) => item.kind === 'Question' && (itemData[item.id]?.answer?.trim() || itemData[item.id]?.note?.trim() || itemData[item.id]?.reviewAt))
      .map((item) => {
        const data = itemData[item.id] || {};
        const explainer = resolveTopicContent(catalog, section.id, topic.id);
        return { id:`item:${item.id}`, sourceId:item.id, sectionId:section.id, sectionName:section.title, label:topic.title, front:item.text, back:data.answer?.trim() || data.note?.trim() || explainer?.explanation || topic.description || 'Try answering from memory, then add your explanation in Practice answers.', kind:'Curriculum' };
      })));
    const noteCards = notes.filter((note) => note.title?.trim() && note.body?.trim()).map((note) => ({ id:`note:${note.id}`, sectionId:'notes', sectionName:'Personal notes', label:note.tags || 'Personal note', front:note.title, back:note.body, kind:'Note' }));
    return [...curriculum,...noteCards,...customCards.map((card) => ({...card,sectionId:card.sectionId || 'custom',sectionName:card.sectionName || 'Custom cards',kind:'Custom'}))];
  }, [catalog,itemData,notes,customCards]);
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id,card])), [cards]);
  const filtered = cards.filter((card) => sectionId === 'all' || card.sectionId === sectionId);
  const dueCards = filtered.filter((card) => {
    const state=schedule[card.id] || {};
    const dueAt=state.dueAt ?? card.dueAt ?? itemData[card.sourceId]?.reviewAt ?? 0;
    return dueAt <= now;
  }).sort((a,b) => (schedule[a.id]?.dueAt || itemData[a.sourceId]?.reviewAt || 0) - (schedule[b.id]?.dueAt || itemData[b.sourceId]?.reviewAt || 0));
  const current = cardMap.get(queue[0]);
  const sectionOptions = [...catalog.sections.map((section) => [section.id,section.title]),['notes','Personal notes'],['custom','Custom cards']];
  function startReview() { setQueue(dueCards.slice(0,20).map((card) => card.id)); setRevealed(false); }
  function rateCard(rating) {
    if (!current) return;
    const old=schedule[current.id] || {};
    let ease=old.ease || 2.5; let repetitions=old.repetitions || 0; let intervalDays=old.intervalDays || 0;
    if (rating === 'again') { repetitions=0; intervalDays=1; ease=Math.max(1.3,ease-0.2); }
    else if (rating === 'hard') { intervalDays=Math.max(1,Math.round((intervalDays || 1)*1.2)); ease=Math.max(1.3,ease-0.15); repetitions+=1; }
    else if (rating === 'good') { intervalDays=repetitions===0?1:repetitions===1?3:Math.max(1,Math.round(intervalDays*ease)); repetitions+=1; }
    else { intervalDays=repetitions===0?4:Math.max(2,Math.round((intervalDays || 3)*ease*1.3)); repetitions+=1; ease=Math.min(3.2,ease+0.15); }
    const reviewedAt=Date.now();
    const next={...schedule,[current.id]:{ease,repetitions,intervalDays,reviewedAt,dueAt:reviewedAt+intervalDays*24*60*60*1000,lastRating:rating}};
    onSchedule(next); setQueue((remaining) => remaining.slice(1)); setRevealed(false);
  }
  function saveCustomCard(event) {
    event.preventDefault();
    if (!cardDraft?.front?.trim() || !cardDraft?.back?.trim()) return;
    onCustomCards([{id:`custom:${Date.now()}`,front:cardDraft.front.trim(),back:cardDraft.back.trim(),sectionId:'custom',sectionName:'Custom cards'},...customCards]); setCardDraft(null);
  }
  return <div className="page-content feature-page"><FeatureHeader eyebrow="SPACED REPETITION" title="Flashcards" subtitle="Review saved curriculum answers, your notes, and custom cards. Rate recall to schedule the next review."/><div className="flashcard-toolbar"><label>Deck<select value={sectionId} onChange={(event) => {setSectionId(event.target.value);setQueue([]);setRevealed(false);}} disabled={queue.length>0}><option value="all">All sources</option>{sectionOptions.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className="flashcard-counts"><span><strong>{dueCards.length}</strong> due</span><span><strong>{cards.length}</strong> cards</span></div><button className="secondary-button" onClick={() => setCardDraft({front:'',back:''})}>+ Create card</button></div>{current ? <section className="flashcard-session"><div className="flashcard-session-top"><span>{current.kind} · {current.sectionName}</span><span>{queue.length} left in this review</span></div><div className="flashcard-face"><span className="flashcard-side-label">{revealed?'ANSWER':'QUESTION'}</span><h2>{revealed?current.back:current.front}</h2>{revealed&&<small>{current.label}</small>}</div>{!revealed ? <button className="primary-button flashcard-reveal" onClick={() => setRevealed(true)}>Show answer</button> : <div className="flashcard-ratings"><span>How well did you recall it?</span><div><button onClick={() => rateCard('again')}>Again <small>1 day</small></button><button onClick={() => rateCard('hard')}>Hard <small>Shorter</small></button><button onClick={() => rateCard('good')}>Good <small>Build interval</small></button><button onClick={() => rateCard('easy')}>Easy <small>Longer</small></button></div></div>}</section> : <section className="flashcard-empty">{queue.length===0&&cards.length>0&&dueCards.length===0 ? <><span className="flashcard-empty-mark">✓</span><h2>You’re caught up</h2><p>Your next review is scheduled. Add a card or come back when more are due.</p></> : <><span className="flashcard-empty-mark">↻</span><h2>{cards.length?'Ready for a review?':'Build your first deck'}</h2><p>{cards.length?`${dueCards.length} cards are ready. A session includes up to 20 cards.`:'Save an answer or mark a curriculum item for review to generate cards. You can also add your own question and answer.'}</p></>}{dueCards.length>0&&<button className="primary-button" onClick={startReview}>Start review · {Math.min(20,dueCards.length)} cards</button>}</section>}{cardDraft&&<div className="modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setCardDraft(null);}}><form className="calendar-form flashcard-create-form" onSubmit={saveCustomCard}><div className="calendar-form-heading"><h2>Create a flashcard</h2><button type="button" onClick={()=>setCardDraft(null)}>×</button></div><label>Question or front<textarea required rows="3" value={cardDraft.front} onChange={(event)=>setCardDraft({...cardDraft,front:event.target.value})} placeholder="What do you want to remember?"/></label><label>Answer or back<textarea required rows="5" value={cardDraft.back} onChange={(event)=>setCardDraft({...cardDraft,back:event.target.value})} placeholder="Write a concise answer or explanation"/></label><button className="primary-button">Save flashcard</button></form></div>}</div>;
}

const calendarDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const calendarTypes = ['Interview','Study','Project milestone','Event'];
const calendarStatuses = ['Planned','Completed','Cancelled'];

export function CalendarView({ events, onChange }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(),today.getMonth(),1));
  const [selectedDay, setSelectedDay] = useState(calendarDateKey(today));
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ title:'',type:'Interview',date:calendarDateKey(today),time:'10:00',company:'',status:'Planned',notes:'' });
  const first = new Date(month.getFullYear(),month.getMonth(),1);
  const offset = (first.getDay()+6)%7;
  const gridStart = new Date(first); gridStart.setDate(first.getDate()-offset);
  const days = Array.from({length:42},(_,index) => { const day=new Date(gridStart); day.setDate(gridStart.getDate()+index); return day; });
  const selectedEvents = events.filter((event) => event.date === selectedDay).sort((a,b) => (a.time || '').localeCompare(b.time || ''));
  const interviews = events.filter((event) => event.type === 'Interview').sort((a,b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  function startEvent(type = 'Interview') { setForm({title:'',type,date:selectedDay,time:'10:00',company:'',status:'Planned',notes:''}); setFormOpen(true); }
  function saveEvent(event) { event.preventDefault(); if (!form.title.trim()) return; onChange([...events,{...form,id:`event-${Date.now()}`,title:form.title.trim()}]); setFormOpen(false); }
  function updateEvent(id, patch) { onChange(events.map((entry) => entry.id === id ? {...entry,...patch} : entry)); }
  function removeEvent(id) { if (window.confirm('Delete this calendar item?')) onChange(events.filter((entry) => entry.id !== id)); }
  return <div className="page-content feature-page"><FeatureHeader eyebrow="INTERVIEW TRACKER & PLANNER" title="Calendar" subtitle="Plan interviews, study blocks, project milestones, and other events in one place."/><div className="calendar-grid-layout"><section className="calendar-card"><div className="calendar-month-header"><button className="secondary-button" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button><h2>{month.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h2><button className="secondary-button" onClick={() => setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button><button className="calendar-today" onClick={() => {setMonth(new Date(today.getFullYear(),today.getMonth(),1));setSelectedDay(calendarDateKey(today));}}>Today</button></div><div className="calendar-weekdays">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-days">{days.map((day) => {const key=calendarDateKey(day); const count=events.filter((entry) => entry.date===key).length; return <button key={key} onClick={() => setSelectedDay(key)} className={`calendar-day ${day.getMonth()!==month.getMonth()?'calendar-day--outside':''} ${key===selectedDay?'calendar-day--selected':''} ${key===calendarDateKey(today)?'calendar-day--today':''}`}><span>{day.getDate()}</span>{count>0&&<i>{count}</i>}</button>;})}</div><div className="calendar-actions"><button className="primary-button" onClick={() => startEvent()}>+ Add interview</button><button className="secondary-button" onClick={() => startEvent('Study')}>+ Plan study time</button><button className="secondary-button" onClick={() => startEvent('Event')}>+ Add event</button></div></section><section className="calendar-detail"><div className="calendar-detail-head"><div><span className="eyebrow eyebrow--muted">SELECTED DAY</span><h2>{new Date(`${selectedDay}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})}</h2></div><button className="secondary-button" onClick={() => startEvent('Project milestone')}>+ Milestone</button></div>{selectedEvents.length ? selectedEvents.map((entry) => <article className="calendar-event-card" key={entry.id}><div className={`calendar-event-type calendar-event-type--${entry.type.toLowerCase().replaceAll(' ','-')}`}>{entry.type}</div><div className="calendar-event-heading"><strong>{entry.title}</strong><small>{entry.time || 'All day'} · {entry.status}</small></div>{entry.company && <p>{entry.company}</p>}{entry.notes && <p>{entry.notes}</p>}<div className="calendar-event-controls"><select aria-label={`Status for ${entry.title}`} value={entry.status || 'Planned'} onChange={(event) => updateEvent(entry.id,{status:event.target.value})}>{calendarStatuses.map((status) => <option key={status}>{status}</option>)}</select><button onClick={() => removeEvent(entry.id)}>Delete</button></div></article>) : <p className="calendar-empty">Nothing planned for this day. Add an interview, study block, milestone, or event.</p>}</section></div><section className="interview-tracker"><div className="interview-tracker-header"><div><span className="eyebrow eyebrow--muted">INTERVIEW PIPELINE</span><h2>Interview tracker</h2></div><button className="primary-button" onClick={() => startEvent('Interview')}>+ Track interview</button></div>{interviews.length ? <div className="interview-table"><div className="interview-row interview-row--head"><span>Date</span><span>Company / interview</span><span>Status</span><span>Notes</span><span/></div>{interviews.map((entry) => <div className="interview-row" key={entry.id}><span>{new Date(`${entry.date}T12:00:00`).toLocaleDateString()} · {entry.time}</span><span><strong>{entry.company || 'Company not set'}</strong><small>{entry.title}</small></span><select value={entry.status||'Planned'} onChange={(event) => updateEvent(entry.id,{status:event.target.value})}>{calendarStatuses.map((status) => <option key={status}>{status}</option>)}</select><span className="interview-note-cell">{entry.notes || '—'}</span><button onClick={() => {setSelectedDay(entry.date);setMonth(new Date(`${entry.date}T12:00:00`));}}>View</button></div>)}</div> : <p className="calendar-empty">No interviews tracked yet. Add one to record company, round, date, status, and notes.</p>}</section>{formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {if(event.target===event.currentTarget)setFormOpen(false);}}><form className="calendar-form" onSubmit={saveEvent}><div className="calendar-form-heading"><h2>Plan an item</h2><button type="button" onClick={() => setFormOpen(false)}>×</button></div><label>Title<input required value={form.title} onChange={(event) => setForm({...form,title:event.target.value})} placeholder={form.type==='Interview'?'System design round':'What are you planning?'}/></label><div className="calendar-form-row"><label>Type<select value={form.type} onChange={(event) => setForm({...form,type:event.target.value})}>{calendarTypes.map((type) => <option key={type}>{type}</option>)}</select></label><label>Status<select value={form.status} onChange={(event) => setForm({...form,status:event.target.value})}>{calendarStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div><div className="calendar-form-row"><label>Date<input type="date" required value={form.date} onChange={(event) => setForm({...form,date:event.target.value})}/></label><label>Time<input type="time" value={form.time} onChange={(event) => setForm({...form,time:event.target.value})}/></label></div>{form.type==='Interview'&&<label>Company<input value={form.company} onChange={(event) => setForm({...form,company:event.target.value})} placeholder="Company name"/></label>}<label>Notes<textarea rows="3" value={form.notes} onChange={(event) => setForm({...form,notes:event.target.value})} placeholder="Round details, interviewer, preparation, or follow-up"/></label><button className="primary-button">Save to calendar</button></form></div>}</div>;
}

function RubricControls({ value, onChange }) {
  return <section className="answer-rubric"><div className="answer-rubric-heading"><div><h3>Answer feedback rubric</h3><p>Rate each dimension from 1 (missing) to 5 (strong).</p></div>{rubricAverage(value) && <strong>{rubricAverage(value).toFixed(1)} / 5</strong>}</div>{rubricCriteria.map(([key,label,description]) => <label className="rubric-control" key={key} title={description}><span><strong>{label}</strong><small>{description}</small></span><select aria-label={label} value={value[key] || ''} onChange={(event) => onChange(key,Number(event.target.value))}><option value="">Rate</option><option value="1">1 · Missing</option><option value="2">2 · Weak</option><option value="3">3 · Adequate</option><option value="4">4 · Strong</option><option value="5">5 · Excellent</option></select></label>)}</section>;
}

function RubricSummary({ rubric = {} }) {
  const average = rubricAverage(rubric);
  return <div className="rubric-summary"><div className="rubric-summary-heading"><strong>Feedback rubric</strong><span>{average ? `${average.toFixed(1)} / 5 average` : 'Not rated'}</span></div><div className="rubric-summary-grid">{rubricCriteria.map(([key,label]) => <span key={key}>{label}<b>{rubric[key] ? `${rubric[key]}/5` : '—'}</b></span>)}</div></div>;
}

function FeatureHeader({ eyebrow, title, subtitle }) { return <header className="feature-header"><div className="eyebrow"><span className="eyebrow-mark"/>{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></header>; }
function ProblemCoach({ item }) { return <section className="problem-coach"><div className="problem-pattern"><strong>Pattern</strong><span>{item.pattern}</span></div>{item.constraints&&<p><strong>Constraints</strong><span>{item.constraints}</span></p>}{item.hints?.length>0&&<details><summary>Progressive hints</summary><ol>{item.hints.map((hint,index)=><li key={`${item.id}-hint-${index}`}>{hint}</li>)}</ol></details>}{item.approach&&<details><summary>Brute force → optimized approach</summary><div className="problem-approach"><p><strong>Brute force</strong>{item.approach.bruteForce}</p><p><strong>Optimized</strong>{item.approach.optimized}</p>{item.approach.complexity&&<p><strong>Complexity goal</strong>{item.approach.complexity}</p>}</div></details>}</section>; }
function InsightMetric({ value, label }) { return <article className="insight-metric"><strong>{value}</strong><span>{label}</span></article>; }
function csvCell(value) { return `"${String(value).replaceAll('"','""')}"`; }
function slug(value) { return String(value || 'learner').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'learner'; }
function download(blob, name) { const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=name; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
