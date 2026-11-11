import { useEffect, useMemo, useRef, useState } from 'react';
import { roadmap } from './data/roadmap.js';
import { BackupView, CalendarView, CloudSyncPanel, CodingPracticeView, FlashcardsView, DatabaseCheckView, InsightsView, MockInterviewView, NotesView, PracticeView } from './FeatureViews.jsx';
import { resolvePrerequisites } from './data/prerequisites.js';
import { resolveTopicContent } from './data/topicContent.js';
import { HLDWhiteboard, LLDStudio } from './DesignViews.jsx';
import { supabase, supabaseConfigured, adminEmail } from './supabase.js';
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m as motion } from 'framer-motion';
import { ArrowRight, BookOpen, Download, Menu, Moon, Sun, X, CalendarDays, ChartNoAxesCombined, ChevronDown, Cloud, Code2, Database, Eye, EyeOff, Layers3, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, Mail, Map as MapIcon, Mic2, Network, PencilLine, Repeat2, ShieldCheck, Sparkles, StickyNote } from 'lucide-react';

const STORAGE_KEY = 'backend-atlas.progress.v1';
const fmt = new Intl.NumberFormat('en');
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const navGroups = [
  { id:'practice', label:'Practice', items:[['practice','Practice answers',PencilLine],['coding','Coding practice',Code2],['mock','Mock interview',Mic2],['flashcards','Flashcards',Layers3]] },
  { id:'design', label:'System design', items:[['hldboard','HLD whiteboard',Network],['lld','LLD practice',Repeat2]] },
  { id:'track', label:'Track & plan', items:[['notes','Notes',StickyNote],['calendar','Calendar',CalendarDays],['insights','Insights',ChartNoAxesCombined]] },
  { id:'data', label:'Data', items:[['dbcheck','Database status',Database],['backup','Backup & sync',Cloud]] },
];
const NAV_GROUPS_KEY = 'backend-atlas.navgroups';
const themes = [
  { id:'light', name:'Light', colors:['#f4f6f9','#2f7d5b'] },
  { id:'sage', name:'Evergreen', colors:['#101b18','#8ccaa0'] },
  { id:'ocean', name:'Deep Ocean', colors:['#111a28','#80b7ec'] },
  { id:'violet', name:'Amethyst', colors:['#191626','#b19cf1'] },
  { id:'ember', name:'Copper', colors:['#211814','#edb080'] },
  { id:'midnight', name:'Midnight', colors:['#0d131d','#87aef7'] },
];

function readStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (parsed?.profiles?.length) {
      // One-time: move saved profiles to the Evergreen login look (user can still change it in the theme picker).
      parsed.profiles = parsed.profiles.map((entry) => entry.preferences?.loginLook ? entry : { ...entry, preferences: { ...(entry.preferences || {}), theme: 'sage', gradient: null, loginLook: true } });
      return parsed;
    }
  } catch { /* Start with an empty local profile. */ }
  return {
    activeProfileId: 'local-default',
    profiles: [{ id: 'local-default', name: 'My learning plan', completed: [], itemData: {}, sessions: [], activeSession: null }],
  };
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.4 4.4"/></>,
    check: <><path d="m5 12.5 4.2 4.2L19.5 6.5"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 5.5v14A2.5 2.5 0 0 1 6.5 17H20"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    chevron: <path d="m7 9 5 5 5-5"/>,
    reset: <><path d="M3.5 11a8.5 8.5 0 1 1 2.4 6"/><path d="M3.5 4.5V11H10"/></>,
    user: <><circle cx="12" cy="8" r="3.3"/><path d="M5 20a7 7 0 0 1 14 0"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    spark: <><path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
  };
  return <svg {...common}>{paths[name] || paths.grid}</svg>;
}

// Lets you type freely (including clearing the box) and applies the 15-600 limit on blur or Enter.
function MinutesInput({ value, onCommit, min = 15, max = 600 }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);
  function commit() {
    setEditing(false);
    const parsed = Number(draft);
    const next = Math.max(min, Math.min(max, Number.isFinite(parsed) && draft.trim() ? Math.round(parsed) : value));
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }
  return <input type="number" inputMode="numeric" min={min} max={max} step="5" value={draft} aria-label="Daily study goal in minutes" onFocus={() => setEditing(true)} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>;
}

function ItemNote({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className={`note-toggle${value ? ' note-toggle--has' : ''}${open ? ' is-open' : ''}`} aria-expanded={open} onClick={() => setOpen((current) => !current)}><PencilLine size={13}/><span>{value ? 'Note' : 'Add note'}</span></button>
    {open && <textarea className="item-note" autoFocus aria-label={`Notes for ${label}`} placeholder="Add a note, example, or answer outline…" value={value} onChange={(event) => onChange(event.target.value)} rows={3}/>}
  </>;
}

function getStats(section, completed) {
  const total = section.topics.reduce((sum, topic) => sum + topic.items.length, 0);
  const done = section.topics.reduce((sum, topic) => sum + topic.items.filter((item) => completed.has(item.id)).length, 0);
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

function ProgressBar({ value, muted = false }) {
  return <div className={`progress-track${muted ? ' progress-track--muted' : ''}`}><span style={{ width: `${value}%` }} /></div>;
}

function App() {
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    fetch('/catalog.json')
      .then((response) => {
        if (!response.ok) throw new Error('Curriculum could not be loaded');
        return response.json();
      })
      .then(setCatalog)
      .catch(() => setLoadError(true));
  }, []);
  if (loadError) return <div className="load-screen"><div className="load-card"><span className="brand-mark"><span/><span/><span/><span/></span><h1>Backend Atlas</h1><p>We couldn’t load the curriculum. Refresh the page to try again.</p></div></div>;
  if (!catalog) return <div className="load-screen"><div className="load-card"><span className="brand-mark"><span/><span/><span/><span/></span><h1>Backend Atlas</h1><p>Preparing your learning map…</p><span className="loading-bar"><i/></span></div></div>;
  return <LazyMotion features={domAnimation}><MotionConfig reducedMotion="user"><AdminGate>{(onLogout)=><LearningApp catalog={catalog} onLogout={onLogout}/>}</AdminGate></MotionConfig></LazyMotion>;
}

const withTimeout = (promise, ms, message) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

function AdminGate({ children }) {
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [authorized,setAuthorized]=useState(false);
  const [devPreview,setDevPreview]=useState(false);
  const [authError,setAuthError]=useState('');
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    if(!supabase){setAuthLoading(false);return;}
    let alive=true;
    withTimeout(supabase.auth.getSession(),8000,'Supabase session check timed out').then(({data,error})=>{
      if(!alive)return;
      if(error)setAuthError('Could not read the current sign-in session. Please refresh and try again.');
      setSession(data?.session||null);setAuthLoading(false);
    }).catch((reason)=>{
      if(!alive)return;
      setAuthError(String(reason?.message||'').includes('timed out')?'Checking your session took too long. Sign in again to continue.':'Could not contact Supabase Auth. Check your project URL and network, then try again.');
      setAuthLoading(false);
    });
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,nextSession)=>{
      // Defer out of the auth callback: calling Supabase from inside it can deadlock the client.
      setTimeout(()=>{
        if(!alive)return;
        if(!nextSession){setSession(null);setAuthorized(false);return;}
        // Token refreshes and tab re-focus events keep the same user, so keep the verified state.
        setSession(nextSession);
        if(event==='SIGNED_IN')setAuthError('');
      },0);
    });
    return()=>{alive=false;subscription.unsubscribe();};
  },[]);

  useEffect(()=>{
    if(!supabase||!session?.user){setAuthorized(false);return;}
    let cancelled=false;
    setAuthorized(false);
    setBusy(true);
    const signedInEmail=(session.user.email||'').toLowerCase();
    if(!adminEmail||signedInEmail!==adminEmail){
      supabase.auth.signOut().finally(()=>{if(!cancelled){setAuthError('This account is not the configured Backend Atlas admin.');setSession(null);setBusy(false);}});
      return()=>{cancelled=true;};
    }
    withTimeout(Promise.resolve(supabase.rpc('backend_atlas_is_admin')),12000,'Admin check timed out').then(({data,error})=>{
      if(cancelled)return;
      if(error||data!==true){
        setAuthorized(false);setAuthError(error?'Could not verify the Supabase admin allowlist. Check your connection and apply supabase/schema.sql.':'This account is not in the Supabase admin allowlist. Finish the admin setup in the Supabase SQL Editor.');
        supabase.auth.signOut();setSession(null);
      }else{setAuthorized(true);setAuthError('');}
      setBusy(false);
    }).catch(()=>{
      if(cancelled)return;
      // Do not leave the spinner up forever: fall back to the sign-in form with a clear message.
      setAuthorized(false);setAuthError('Verifying your session took too long. Check your connection (a paused free-tier Supabase project can take a minute to wake) and sign in again.');
      setSession(null);setBusy(false);
    });
    return()=>{cancelled=true;};
  },[session?.user?.id]);

  async function signIn(email,password){
    if(!supabase)return;
    setBusy(true);setAuthError('');
    try {
      const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(error){setAuthError('Email or password is incorrect. Check the admin account in Supabase and try again.');setBusy(false);}
    } catch { setAuthError('Could not contact Supabase Auth. Check your connection and try again.');setBusy(false); }
  }
  async function signOut(){setBusy(true);await supabase?.auth.signOut();setSession(null);setAuthorized(false);setBusy(false);}

  if(devPreview&&import.meta.env.DEV)return children(()=>setDevPreview(false));
  const openDevPreview=import.meta.env.DEV?()=>setDevPreview(true):undefined;
  if(authLoading||busy&&session?.user&&authorized===false&&!authError)return <AuthLoading/>;
  if(!supabaseConfigured||!adminEmail)return <AdminLogin setupRequired onSubmit={signIn} busy={busy} error={authError} onDevPreview={openDevPreview}/>;
  if(session?.user&&authorized)return children(signOut);
  return <AdminLogin onSubmit={signIn} busy={busy} error={authError} onDevPreview={openDevPreview}/>;
}

function AuthLoading(){
  const [slow,setSlow]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setSlow(true),6000);return()=>clearTimeout(timer);},[]);
  return <div className="auth-loading"><LoaderCircle className="spin" size={23}/><span>Verifying your secure session</span>{slow&&<><small className="auth-loading-slow">Taking longer than usual…</small><button className="auth-loading-retry" onClick={()=>window.location.reload()}>Reload</button></>}</div>;
}

function AdminLogin({setupRequired=false,onSubmit,busy,error,onDevPreview}){
  const [email,setEmail]=useState(adminEmail||'');
  const [password,setPassword]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const submit=(event)=>{event.preventDefault();onSubmit(email,password);};
  return <main className="login-v2">
    <div className="login-atmosphere" aria-hidden="true"><i/><i/><i/></div>
    <motion.section className="login-story" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{duration:.55,ease:[.22,1,.36,1]}}>
      <div className="login-brand"><span className="login-brand-mark"><Layers3 size={21}/></span><span><b>Backend Atlas</b><small>ENGINEERING INTERVIEW WORKSPACE</small></span></div>
      <div className="login-story-copy"><span className="login-kicker"><Sparkles size={14}/> V2 · YOUR PRIVATE WORKSPACE</span><h1>Build the skills.<br/><em>Own the interview.</em></h1><p>A focused space for your backend roadmap, system designs, coding practice, and interview progress.</p>
        <div className="login-highlights"><span><i>01</i> A roadmap built for senior engineers</span><span><i>02</i> Practice from fundamentals to trading systems</span><span><i>03</i> Your notes and progress, kept together</span></div>
      </div>
      <div className="login-story-foot"><ShieldCheck size={15}/> Private sign-in · Encrypted by Supabase Auth</div>
    </motion.section>
    <section className="login-panel-wrap"><AnimatePresence mode="wait"><motion.div className="login-panel" key={setupRequired?'setup':'login'} initial={{opacity:0,y:14,scale:.985}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8}} transition={{duration:.35,ease:'easeOut'}}>
      <span className="login-mobile-brand"><Layers3 size={18}/> Backend Atlas</span>
      {setupRequired?<><div className="login-lock"><LockKeyhole size={21}/></div><span className="login-kicker">ADMIN ACCESS SETUP</span><h2>Connect your Supabase project</h2><p className="login-panel-subtitle">The sign-in gate is ready. Add the project settings and the single admin account to enable it.</p><div className="login-setup-steps"><b>1. Add these values to <code>.env.local</code></b><pre>VITE_SUPABASE_URL=…<br/>VITE_SUPABASE_PUBLISHABLE_KEY=…<br/>VITE_ADMIN_EMAIL=admin@example.com</pre><b>2. Run <code>supabase/schema.sql</code></b><b>3. Create one Auth user and disable public sign-ups</b><b>4. Add that user to <code>backend_atlas_admins</code></b></div><p className="login-warning">No password is stored in this app. Supabase Auth handles the password securely.</p></>
        :<><div className="login-lock"><LockKeyhole size={21}/></div><span className="login-kicker">WELCOME BACK</span><h2>Sign in to your workspace</h2><p className="login-panel-subtitle">Use the admin credentials managed in your Supabase project.</p><form className="login-form" onSubmit={submit}><label htmlFor="admin-email">Admin email</label><div className="login-input-wrap"><Mail size={16}/><input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="admin@example.com"/></div><label htmlFor="admin-password">Password</label><div className="login-input-wrap"><LockKeyhole size={16}/><input id="admin-password" type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="Enter your password"/><button type="button" aria-label={showPassword?'Hide password':'Show password'} onClick={()=>setShowPassword((value)=>!value)}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>{error&&<div className="login-error" role="alert">{error}</div>}<button className="login-submit" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<>Enter workspace <ArrowRight size={16}/></>}</button></form><div className="login-secure-note"><ShieldCheck size={15}/> Single-admin access · Protected by Supabase RLS</div></>}
      {onDevPreview&&<button className="dev-preview-button" type="button" onClick={onDevPreview}>Open local preview <ArrowRight size={14}/><small>Development only</small></button>}
    </motion.div></AnimatePresence><footer className="login-footer">Backend Atlas <span>·</span> Private learning workspace</footer></section>
  </main>;
}

function LearningApp({ catalog, onLogout }) {
  const [store, setStore] = useState(readStore);
  const [activeSectionId, setActiveSectionId] = useState(null);
  const [activeView, setActiveView] = useState('overview');
  const [expandedTopicId, setExpandedTopicId] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMode, setProfileMode] = useState('create');
  const [profileDraft, setProfileDraft] = useState('');
  const [profileMenu, setProfileMenu] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => {
    try { return { practice:true, design:true, track:false, data:false, curriculum:true, ...JSON.parse(localStorage.getItem(NAV_GROUPS_KEY)) }; } catch { return { practice:true, design:true, track:false, data:false, curriculum:true }; }
  });
  const toggleGroup = (id) => setOpenGroups((current) => ({ ...current, [id]: !current[id] }));
  useEffect(() => { try { localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify(openGroups)); } catch { /* ignore */ } }, [openGroups]);
  useEffect(() => {
    const group = navGroups.find((entry) => entry.items.some(([view]) => view === activeView));
    if (group) setOpenGroups((current) => current[group.id] ? current : { ...current, [group.id]: true });
  }, [activeView]);
  useEffect(() => {
    if (!themeOpen && !userMenu) return undefined;
    const close = (event) => { if (!event.target.closest('.theme-menu-wrap, .user-menu-wrap')) { setThemeOpen(false); setUserMenu(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [themeOpen, userMenu]);
  const [installEvent, setInstallEvent] = useState(null);
  useEffect(() => {
    const onPrompt = (event) => { event.preventDefault(); setInstallEvent(event); };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  async function installApp() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice.catch(() => {});
    setInstallEvent(null);
  }
  const [clock, setClock] = useState(Date.now());
  const [reminderMessage, setReminderMessage] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!activeSectionId) setActiveSectionId(catalog.sections[0]?.id);
        window.setTimeout(() => searchRef.current?.focus(), 30);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [activeSectionId]);

  const profile = store.profiles.find((entry) => entry.id === store.activeProfileId) || store.profiles[0];
  const systemTheme = 'sage';
  const theme = themes.some((entry) => entry.id === profile?.preferences?.theme) ? profile.preferences.theme : systemTheme;
  const isLight = theme === 'light';
  const lastDarkTheme = profile?.preferences?.lastDarkTheme || 'midnight';
  function toggleColorMode() {
    if (isLight) updatePreferences({ theme: lastDarkTheme });
    else updatePreferences({ theme: 'light', lastDarkTheme: theme });
  }
  useEffect(() => {
    document.documentElement.dataset.colorMode = isLight ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLight ? '#f4f6f9' : '#0d1117');
  }, [isLight]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setNavOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [navOpen]);
  const completed = useMemo(() => new Set(profile?.completed || []), [profile]);
  const activeSection = catalog.sections.find((section) => section.id === activeSectionId);
  const allStats = useMemo(() => {
    const total = catalog.sections.reduce((sum, section) => sum + section.itemCount, 0);
    const done = catalog.sections.reduce((sum, section) => sum + getStats(section, completed).done, 0);
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }, [completed]);
  const completedSections = catalog.sections.filter((section) => getStats(section, completed).percent === 100 && section.itemCount > 0).length;
  const activeTopics = catalog.sections.flatMap((section) => section.topics).filter((topic) => {
    const count = topic.items.filter((item) => completed.has(item.id)).length;
    return count > 0 && count < topic.items.length;
  }).length;
  const nextItem = catalog.sections.flatMap((section) => section.topics.flatMap((topic) => topic.items.map((item) => ({ ...item, section, topic })))).find((item) => !completed.has(item.id));
  const reviewItems = catalog.sections.flatMap((section) => section.topics.flatMap((topic) => topic.items.map((item) => ({ ...item, section, topic })))).filter((item) => {
    const reviewAt = profile?.itemData?.[item.id]?.reviewAt;
    return reviewAt && reviewAt <= clock;
  });
  const todayKey = localDay();
  const activeTodayMinutes = profile?.activeSession && localDay(new Date(profile.activeSession)) === todayKey ? Math.floor((clock-profile.activeSession)/60000) : 0;
  const todayMinutes = (profile?.sessions || []).filter((session) => session.date === todayKey).reduce((sum, session) => sum + session.minutes, 0) + activeTodayMinutes;
  const totalMinutes = (profile?.sessions || []).reduce((sum, session) => sum + session.minutes, 0) + (profile?.activeSession ? Math.floor((clock - profile.activeSession) / 60000) : 0);
  const studiedDays = new Set((profile?.sessions || []).map((session) => session.date));
  if (activeTodayMinutes > 0) studiedDays.add(todayKey);
  const streakAnchor = new Date();
  if (!studiedDays.has(todayKey)) streakAnchor.setDate(streakAnchor.getDate()-1);
  let studyStreak = 0;
  while (studiedDays.has(localDay(streakAnchor))) { studyStreak += 1; streakAnchor.setDate(streakAnchor.getDate()-1); }

  useEffect(() => {
    if (profile?.activeInterview && clock >= profile.activeInterview.startedAt + profile.activeInterview.durationMs) finishInterview();
  }, [clock, profile?.activeInterview?.startedAt, profile?.activeInterview?.durationMs]);

  useEffect(() => {
    const prefs = profile?.preferences || {};
    if (!prefs.reminderEnabled || !('Notification' in window) || Notification.permission !== 'granted' || prefs.lastReminderDay === todayKey) return;
    const timeNow = new Date();
    const currentTime = `${String(timeNow.getHours()).padStart(2,'0')}:${String(timeNow.getMinutes()).padStart(2,'0')}`;
    const target = Number(prefs.dailyGoalMinutes) || 90;
    if (currentTime >= (prefs.reminderTime || '19:00') && todayMinutes < target) {
      new Notification('Backend Atlas study reminder', { body:`You have studied ${todayMinutes} of your ${target} minute goal today.` });
      setStore((current) => ({ ...current, profiles:current.profiles.map((entry) => entry.id === current.activeProfileId ? { ...entry, preferences:{ ...(entry.preferences || {}), lastReminderDay:todayKey } } : entry) }));
    }
  }, [clock, profile?.preferences?.reminderEnabled, profile?.preferences?.reminderTime, profile?.preferences?.dailyGoalMinutes, todayMinutes, todayKey]);

  function toggleItem(itemId) {
    setStore((current) => {
      const selected = current.profiles.find((entry) => entry.id === current.activeProfileId);
      const set = new Set(selected.completed || []);
      if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
      return { ...current, profiles: current.profiles.map((entry) => entry.id === selected.id ? { ...entry, completed: [...set] } : entry) };
    });
  }

  function updateItemData(itemId, patch) {
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => entry.id === current.activeProfileId ? { ...entry, itemData: { ...(entry.itemData || {}), [itemId]: { ...(entry.itemData?.[itemId] || {}), ...patch } } } : entry) }));
  }

  function savePracticeAnswer(itemId, answer) {
    updateItemData(itemId, { answer });
  }

  function saveCodingWork(itemId, coding) {
    updateItemData(itemId, { coding });
  }

  function updatePreferences(patch) {
    setStore((current) => ({...current,profiles:current.profiles.map((entry) => entry.id === current.activeProfileId ? {...entry,preferences:{...(entry.preferences || {}),...patch}} : entry)}));
  }

  function updateProfileData(key, value) {
    setStore((current) => ({...current,profiles:current.profiles.map((entry) => entry.id === current.activeProfileId ? {...entry,[key]:value} : entry)}));
  }

  async function setDailyReminder(enabled) {
    if (!enabled) { updatePreferences({reminderEnabled:false}); setReminderMessage('Daily reminder is off.'); return; }
    if (!('Notification' in window)) { setReminderMessage('This browser does not support notifications.'); return; }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') { setReminderMessage('Allow notifications in your browser to enable reminders.'); return; }
    updatePreferences({reminderEnabled:true});
    setReminderMessage('Daily reminder enabled while Backend Atlas is open.');
  }

  function startInterview(pool, count, minutes) {
    const candidates = [...pool];
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swap]] = [candidates[swap], candidates[index]];
    }
    const questions = candidates.slice(0, count);
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => entry.id === current.activeProfileId ? { ...entry, activeInterview: { id:`mock-${Date.now()}`, startedAt:Date.now(), durationMs:minutes * 60000, questions, answers:{}, currentIndex:0 } } : entry) }));
  }

  function updateInterview(change) {
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => {
      if (entry.id !== current.activeProfileId || !entry.activeInterview) return entry;
      const interview = entry.activeInterview;
      if (change.type === 'next') return { ...entry, activeInterview: { ...interview, currentIndex: Math.min(interview.currentIndex + 1, interview.questions.length - 1) } };
      const prior = interview.answers[change.itemId] || {};
      const value = change.type === 'answer' ? { ...prior, text:change.value }
        : change.type === 'rating' ? { ...prior, rating:change.value }
          : change.type === 'rubric' ? { ...prior, rubric:{ ...(prior.rubric || {}), [change.dimension]:change.value } }
            : prior;
      return { ...entry, activeInterview: { ...interview, answers: { ...interview.answers, [change.itemId]:value } } };
    }) }));
  }

  function finishInterview() {
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => {
      if (entry.id !== current.activeProfileId || !entry.activeInterview) return entry;
      const interview = entry.activeInterview;
      const endedAt = Date.now();
      const questions = interview.questions.map((question) => ({ ...question, answer:interview.answers[question.id]?.text || '', rating:interview.answers[question.id]?.rating || null, rubric:interview.answers[question.id]?.rubric || {} }));
      return { ...entry, activeInterview:null, mockHistory:[...(entry.mockHistory || []), { id:interview.id, endedAt, durationMinutes:Math.max(1,Math.round((endedAt-interview.startedAt)/60000)), questions }] };
    }) }));
    setActiveView('mock');
  }

  function importProfile(imported) {
    setStore((current) => ({ ...current, profiles:current.profiles.map((entry) => entry.id === current.activeProfileId ? { ...entry, ...imported, id:entry.id, activeInterview:null } : entry) }));
  }

  function startSession() {
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => entry.id === current.activeProfileId && !entry.activeSession ? { ...entry, activeSession: Date.now() } : entry) }));
  }

  function finishSession() {
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => {
      if (entry.id !== current.activeProfileId || !entry.activeSession) return entry;
      const minutes = Math.max(1, Math.round((Date.now() - entry.activeSession) / 60000));
      return { ...entry, activeSession: null, sessions: [...(entry.sessions || []), { date: localDay(), minutes, endedAt: Date.now() }] };
    }) }));
  }

  function openSection(sectionId) {
    setActiveView('curriculum');
    setActiveSectionId(sectionId);
    setExpandedTopicId(null);
    setSearch('');
    setFilter('all');
    setProfileMenu(false);
  }

  function openOverview() {
    setActiveSectionId(null);
    setActiveView('overview');
    setSearch('');
    setProfileMenu(false);
  }

  function openRoadmap() {
    setActiveSectionId(null);
    setActiveView('roadmap');
    setProfileMenu(false);
  }

  function openFeature(view) {
    setActiveSectionId(null);
    setActiveView(view);
    setProfileMenu(false);
  }

  function openTopic(sectionId, topicId) {
    openSection(sectionId);
    setExpandedTopicId(topicId);
    requestAnimationFrame(() => document.getElementById(`topic-${topicId}`)?.scrollIntoView({ behavior:'smooth', block:'center' }));
  }

  function startNext() {
    if (!nextItem) return;
    openSection(nextItem.section.id);
    setExpandedTopicId(nextItem.topic.id);
    requestAnimationFrame(() => document.getElementById(`topic-${nextItem.topic.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function saveProfileName() {
    const clean = profileDraft.trim();
    if (!clean) return;
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => entry.id === current.activeProfileId ? { ...entry, name: clean } : entry) }));
    setProfileOpen(false);
  }

  function createProfile() {
    const clean = profileDraft.trim();
    if (!clean) return;
    const id = `local-${Date.now()}`;
    setStore((current) => ({ activeProfileId: id, profiles: [...current.profiles, { id, name: clean, completed: [], itemData: {}, sessions: [], activeSession: null }] }));
    setProfileOpen(false);
    setActiveSectionId(null);
    setActiveView('overview');
    setExpandedTopicId(null);
    setProfileDraft('');
  }

  function switchProfile(id) {
    setStore((current) => ({ ...current, activeProfileId: id }));
    setProfileMenu(false);
    setActiveSectionId(null);
    setActiveView('overview');
    setExpandedTopicId(null);
  }

  function resetProgress() {
    if (!window.confirm(`Clear all progress for ${profile.name}? This only affects this local profile.`)) return;
    setStore((current) => ({ ...current, profiles: current.profiles.map((entry) => entry.id === current.activeProfileId ? { ...entry, completed: [], itemData: {}, sessions: [], activeSession: null, activeInterview: null, mockHistory: [] } : entry) }));
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <aside id="app-sidebar" className={`sidebar${navOpen ? ' is-open' : ''}`} onClick={(event) => { if (event.target.closest('.nav-link, .brand')) setNavOpen(false); }}>
        <button className="brand" onClick={openOverview} aria-label="Go to dashboard">
          <span className="brand-mark"><span /><span /><span /><span /></span>
          <span className="brand-copy"><strong>Backend Atlas</strong><small>V2 · Senior engineer workspace</small></span>
        </button>
        <div className="side-main">
          <button className={`nav-link ${activeView === 'overview' ? 'is-active' : ''}`} onClick={openOverview}><LayoutDashboard size={16}/><span>Overview</span></button>
          <button className={`nav-link roadmap-nav ${activeView === 'roadmap' ? 'is-active' : ''}`} onClick={openRoadmap}><MapIcon size={16}/><span>24-week roadmap</span></button>
        </div>
        {navGroups.map((group) => <div className="nav-group" key={group.id}>
          <button className="nav-group-toggle" aria-expanded={!!openGroups[group.id]} onClick={() => toggleGroup(group.id)}><span>{group.label}</span><ChevronDown size={13} className={openGroups[group.id] ? '' : 'is-collapsed'}/></button>
          {openGroups[group.id] && <div className="nav-group-items">{group.items.map(([view, label, Mark]) => <button key={view} className={`nav-link feature-nav ${activeView === view ? 'is-active' : ''}`} onClick={() => openFeature(view)}><span className="feature-nav-mark"><Mark size={15}/></span><span>{label}</span></button>)}</div>}
        </div>)}
        <div className="nav-group nav-group--curriculum">
          <button className="nav-group-toggle" aria-expanded={!!openGroups.curriculum} onClick={() => toggleGroup('curriculum')}><span>Curriculum</span><b>{catalog.sections.length}</b><ChevronDown size={13} className={openGroups.curriculum ? '' : 'is-collapsed'}/></button>
        </div>
        {openGroups.curriculum && <nav className="section-nav" aria-label="Curriculum sections">
          {catalog.sections.map((section, index) => {
            const stats = getStats(section, completed);
            return <button key={section.id} className={`nav-link nav-link--section ${activeSectionId === section.id ? 'is-active' : ''}`} onClick={() => openSection(section.id)}>
              <span className={`section-number section-number--${index + 1}`}>{String(index + 1).padStart(2, '0')}</span>
              <span className="nav-section-copy"><span>{section.title}</span><small>{stats.done} of {stats.total} complete</small></span>
              <span className="nav-mini-progress" aria-label={`${stats.percent}% complete`}><i style={{ '--progress': `${stats.percent * 3.6}deg` }} /></span>
            </button>;
          })}
        </nav>}
        <div className="sidebar-bottom">
          <button className="profile-button" onClick={() => setProfileMenu((value) => !value)}>
            <span className="avatar">{(profile?.name || 'M').slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy"><strong>{profile?.name || 'My learning plan'}</strong><small>Local profile</small></span>
            <Icon name="chevron" size={15}/>
          </button>
          {profileMenu && <div className="profile-popover">
            <div className="popover-heading">Switch learner</div>
            {store.profiles.map((entry) => <button key={entry.id} className="profile-option" onClick={() => switchProfile(entry.id)}><span className="avatar avatar--small">{entry.name.slice(0, 1).toUpperCase()}</span><span>{entry.name}</span>{entry.id === profile.id && <Icon name="check" size={15}/>}</button>)}
            <button className="new-profile" onClick={() => { setProfileMode('create'); setProfileDraft(''); setProfileOpen(true); setProfileMenu(false); }}><Icon name="plus" size={15}/> Add learner profile</button>
            <button className="new-profile" onClick={() => { setProfileMode('rename'); setProfileDraft(profile.name); setProfileOpen(true); setProfileMenu(false); }}><Icon name="user" size={15}/> Rename this profile</button>
            <button className="new-profile new-profile--danger" onClick={() => { setProfileMenu(false); resetProgress(); }}><Icon name="reset" size={15}/> Reset this profile</button>
          </div>}
        </div>
      </aside>

      <div className={`nav-backdrop${navOpen ? ' is-visible' : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />
      <main className="main-area">
        <header className="topbar">
          <button className="nav-toggle" aria-label={navOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={navOpen} aria-controls="app-sidebar" onClick={() => setNavOpen((value) => !value)}>{navOpen ? <X size={20}/> : <Menu size={20}/>}</button>
          <div className="breadcrumbs"><span>Learning workspace</span><b>/</b><strong>{activeSection ? activeSection.title : ({ roadmap:'24-week roadmap', practice:'Practice answers', coding:'Coding practice', mock:'Mock interview', flashcards:'Flashcards', notes:'Notes', calendar:'Interview & event calendar', dbcheck:'Database status', hldboard:'HLD whiteboard', lld:'LLD practice', insights:'Progress insights', backup:'Backup & sync' }[activeView] || 'Overview')}</strong></div>
          <div className="top-actions">
            {installEvent && <button className="install-button" onClick={installApp} title="Install Backend Atlas as an app"><Download size={15}/><span>Install app</span></button>}
            <button className="mode-toggle" onClick={toggleColorMode} aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'} title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}>{isLight ? <Moon size={16}/> : <Sun size={16}/>}</button>
            <div className="theme-menu-wrap">
              <button className="theme-trigger" aria-expanded={themeOpen} aria-label="Choose appearance theme" onClick={() => setThemeOpen((value) => !value)}><span className="theme-trigger-dot" style={{background:themes.find((entry)=>entry.id===theme)?.colors[1]}}/><span>Theme</span><ChevronDown size={14}/></button>
              {themeOpen && <div className="theme-popover" role="dialog" aria-label="Appearance themes"><strong>Theme</strong>{themes.map((option)=><button key={option.id} className={`theme-option${theme===option.id?' is-selected':''}`} aria-pressed={theme===option.id} onClick={()=>{updatePreferences({theme:option.id});setThemeOpen(false);}}><span className="theme-swatch" style={{'--swatch-dark':option.colors[0],'--swatch-accent':option.colors[1]}}/><span>{option.name}</span>{theme===option.id&&<Icon name="check" size={15}/>}</button>)}</div>}
            </div>
            <div className="user-menu-wrap">
              <button className="top-avatar" aria-expanded={userMenu} aria-label="Account menu" onClick={() => setUserMenu((value) => !value)}>{(profile?.name || 'M').slice(0, 1).toUpperCase()}</button>
              {userMenu && <div className="user-popover" role="menu">
                <div className="user-popover-head"><strong>{profile?.name || 'My learning plan'}</strong><small>Local profile</small></div>
                <button role="menuitem" onClick={() => { setProfileMode('rename'); setProfileDraft(profile.name); setProfileOpen(true); setUserMenu(false); }}><Icon name="user" size={15}/> Edit profile</button>
                <a role="menuitem" href="/senior-backend-interview-preparation.pdf" target="_blank" rel="noreferrer" onClick={() => setUserMenu(false)}><BookOpen size={15}/> Open guide PDF</a>
                <button role="menuitem" onClick={() => { setUserMenu(false); onLogout(); }}><LogOut size={15}/> Sign out</button>
              </div>}
            </div>
          </div>
        </header>

        <motion.div className="route-transition" key={activeSectionId || activeView} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2,ease:"easeOut"}}>{activeSection ? <SectionView
          section={activeSection}
          catalog={catalog}
          completed={completed}
          onToggle={toggleItem}
          itemData={profile?.itemData || {}}
          onUpdateItem={updateItemData}
          onOpenPrerequisite={openTopic}
          expandedTopicId={expandedTopicId}
          setExpandedTopicId={setExpandedTopicId}
          search={search}
          setSearch={setSearch}
          filter={filter}
          setFilter={setFilter}
          searchRef={searchRef}
          onBack={openOverview}
        /> : activeView === 'roadmap' ? <RoadmapView catalog={catalog} completed={completed} itemData={profile?.itemData || {}} now={clock} onOpenTopic={openTopic} />
        : activeView === 'practice' ? <PracticeView catalog={catalog} itemData={profile?.itemData || {}} completed={completed} onSaveAnswer={savePracticeAnswer} />
        : activeView === 'coding' ? <CodingPracticeView catalog={catalog} itemData={profile?.itemData || {}} onSaveCoding={saveCodingWork} />
        : activeView === 'mock' ? <MockInterviewView catalog={catalog} interview={profile?.activeInterview} history={profile?.mockHistory || []} now={clock} onStart={startInterview} onUpdate={updateInterview} onFinish={finishInterview} />
        : activeView === 'flashcards' ? <FlashcardsView catalog={catalog} itemData={profile?.itemData || {}} notes={profile?.notes || []} schedule={profile?.flashcardState || {}} onSchedule={(schedule) => updateProfileData('flashcardState',schedule)} customCards={profile?.flashcards || []} onCustomCards={(cards) => updateProfileData('flashcards',cards)} />
        : activeView === 'notes' ? <NotesView notes={profile?.notes || []} onChange={(notes) => updateProfileData('notes',notes)} />
        : activeView === 'calendar' ? <CalendarView events={profile?.events || []} onChange={(events) => updateProfileData('events',events)} />
        : activeView === 'dbcheck' ? <DatabaseCheckView />
        : activeView === 'hldboard' ? <HLDWhiteboard theme={isLight ? 'light' : 'dark'} boards={profile?.designBoards || []} onChange={(boards) => updateProfileData('designBoards',boards)} />
        : activeView === 'lld' ? <LLDStudio drafts={profile?.lldDrafts || {}} onChange={(drafts) => updateProfileData('lldDrafts',drafts)} />
        : activeView === 'insights' ? <InsightsView catalog={catalog} itemData={profile?.itemData || {}} completed={completed} sessions={profile?.sessions || []} mockHistory={profile?.mockHistory || []} reviewItems={reviewItems} personalNotes={profile?.notes || []} />
        : activeView === 'backup' ? <BackupView profile={profile} onImport={importProfile} /> : <Dashboard
          catalog={catalog}
          profile={profile}
          stats={allStats}
          completedSections={completedSections}
          activeTopics={activeTopics}
          nextItem={nextItem}
          onOpen={openSection}
          onContinue={startNext}
          completed={completed}
          reviewItems={reviewItems}
          sessions={profile?.sessions || []}
          activeSession={profile?.activeSession}
          clock={clock}
          todayMinutes={todayMinutes}
          totalMinutes={totalMinutes}
          studyStreak={studyStreak}
          preferences={profile?.preferences || {}}
          reminderMessage={reminderMessage}
          onUpdatePreferences={updatePreferences}
          onSetReminder={setDailyReminder}
          onStartSession={startSession}
          onFinishSession={finishSession}
          onReviewItem={(item) => { openSection(item.section.id); setExpandedTopicId(item.topic.id); }}
          onOpenFlashcards={() => openFeature('flashcards')}
        />}</motion.div>
        <CloudSyncPanel store={store} onRestore={(cloudStore) => { if (cloudStore?.profiles?.length) setStore(cloudStore); }} visible={activeView === 'backup'} />
      </main>

      {profileOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
        <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
          <button className="modal-close" onClick={() => setProfileOpen(false)} aria-label="Close"><Icon name="close"/></button>
          <span className="modal-icon"><Icon name="user" size={22}/></span>
          <h2 id="profile-title">{profileMode === 'create' ? 'Create learner profile' : 'Rename learner profile'}</h2>
          <p>Progress stays available locally. Connect Supabase from Backup & sync to use the same learner data on other devices.</p>
          <label htmlFor="profile-name">Learner name</label>
          <input id="profile-name" autoFocus value={profileDraft} onChange={(event) => setProfileDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && (profileMode === 'create' ? createProfile() : saveProfileName())} placeholder="e.g. Alex" />
          <button className="primary-button modal-submit" onClick={profileMode === 'create' ? createProfile : saveProfileName}>
            Save profile
          </button>
          <button className="text-button" onClick={() => { setProfileDraft(''); setProfileOpen(false); }}>Cancel</button>
        </section>
      </div>}
    </div>
  );
}

function RoadmapView({ catalog, completed, itemData, now, onOpenTopic }) {
  const weeks = roadmap.map((week) => ({
    ...week,
    topics: week.topicRefs.map(([sectionIndex, topicIndex]) => ({ section: catalog.sections[sectionIndex], topic: catalog.sections[sectionIndex]?.topics[topicIndex] })).filter((entry) => entry.section && entry.topic),
  }));
  const allTopics = [...new Map(weeks.flatMap((week) => week.topics.map(({ topic }) => [topic.id, topic]))).values()];
  const total = allTopics.reduce((sum, topic) => sum + topic.items.length, 0);
  const done = allTopics.reduce((sum, topic) => sum + topic.items.filter((item) => completed.has(item.id)).length, 0);
  const percent = total ? Math.round(done / total * 100) : 0;
  const weekStats = weeks.map((week) => {
    const items=week.topics.flatMap(({topic})=>topic.items);
    const completedItems=items.filter((item)=>completed.has(item.id)).length;
    return {...week,items,completedItems,complete:items.length > 0 && completedItems === items.length};
  });
  const currentWeek = weekStats.find((week) => !week.complete) || weekStats.at(-1);
  const nextTopic = weekStats.flatMap((week) => week.topics.map((entry)=>({...entry,week:week.week}))).find(({topic})=>topic.items.some((item)=>!completed.has(item.id)));
  let recommended = nextTopic;
  let recommendationReason = 'Continue the weekly sequence';
  if (nextTopic) {
    const missingPrerequisite=resolvePrerequisites(catalog,nextTopic.section.id,nextTopic.topic.id).find(({topic})=>topic.items.some((item)=>!completed.has(item.id)));
    if (missingPrerequisite) {
      const dueItem=missingPrerequisite.topic.items.find((item)=>itemData[item.id]?.reviewAt && itemData[item.id].reviewAt <= now);
      recommended={...missingPrerequisite,week:nextTopic.week};
      recommendationReason=dueItem ? 'Review a due prerequisite before moving on' : `Prerequisite for Week ${nextTopic.week}`;
    } else {
      const reviewItem=nextTopic.topic.items.find((item)=>itemData[item.id]?.reviewAt && itemData[item.id].reviewAt <= now);
      const unsureItem=nextTopic.topic.items.find((item)=>['learning','practicing'].includes(itemData[item.id]?.confidence));
      if (reviewItem || unsureItem) recommendationReason=reviewItem ? 'A topic review is due' : 'Revisit a low-confidence area';
    }
  }
  const [expandedWeek,setExpandedWeek]=useState(currentWeek?.week || 1);
  useEffect(()=>{if(currentWeek)setExpandedWeek(currentWeek.week);},[currentWeek?.week]);
  return <div className="page-content roadmap-page">
    <section className="roadmap-hero">
      <div><div className="eyebrow"><span className="eyebrow-mark"/> LEARNING SEQUENCE</div><h1>Your 24-week backend roadmap</h1><p>One suggested sequence through the topics already in your curriculum. Each week links to the original section, so progress stays in one place.</p></div>
      <div className="roadmap-overall"><strong>{percent}<small>%</small></strong><ProgressBar value={percent} muted/><span>{fmt.format(done)} of {fmt.format(total)} roadmap items complete</span></div>
    </section>
    <div className="roadmap-note"><strong>Suggested pace</strong><span>Plan for about three hours a day, five days a week. Adjust the pace to fit your schedule; your completion tracking works across both roadmap and section views.</span></div>
    {recommended && <section className="adaptive-recommendation"><div><span className="eyebrow eyebrow--muted">YOUR NEXT STEP · WEEK {recommended.week}</span><h2>{cleanHeading(recommended.topic.title)}</h2><p>{recommendationReason}. {recommended.section.title}</p></div><button className="primary-button" onClick={()=>onOpenTopic(recommended.section.id,recommended.topic.id)}>Open topic <Icon name="arrow" size={15}/></button></section>}
    <div className="roadmap-phase-labels"><span>01–06 · Go foundations</span><span>07–12 · Data systems</span><span>13–19 · Infrastructure</span><span>20–24 · System design</span></div>
    <div className="roadmap-list">{weeks.map((week) => {
      const weekItems = week.topics.flatMap(({ topic }) => topic.items);
      const weekDone = weekItems.filter((item) => completed.has(item.id)).length;
      const weekPercent = weekItems.length ? Math.round(weekDone / weekItems.length * 100) : 0;
      const open = expandedWeek === week.week;
      return <article className={`roadmap-week ${open ? 'roadmap-week--open' : ''} ${currentWeek?.week === week.week ? 'roadmap-week--current' : ''}`} key={week.week}>
        <button className="roadmap-week-header" onClick={() => setExpandedWeek(open ? null : week.week)} aria-expanded={open}>
          <span className="roadmap-week-number">{String(week.week).padStart(2,'0')}</span><span className="roadmap-week-copy"><strong>Week {week.week} · {week.title}{currentWeek?.week === week.week && <em>This week</em>}</strong><small>{week.focus}</small></span><span className="roadmap-week-meter"><i style={{width:`${weekPercent}%`}}/></span><span className="roadmap-week-count">{weekDone}/{weekItems.length}</span><span className="roadmap-chevron"><Icon name="chevron" size={17}/></span>
        </button>
        {open && <div className="roadmap-week-content"><p>{week.focus}</p>{week.topics.map(({ section, topic }) => {
          const itemDone = topic.items.filter((item) => completed.has(item.id)).length;
          const topicPercent = topic.items.length ? Math.round(itemDone / topic.items.length * 100) : 0;
          return <button className="roadmap-topic-link" key={`${section.id}-${topic.id}`} onClick={() => onOpenTopic(section.id, topic.id)}><span className={`roadmap-topic-check ${topicPercent === 100 ? 'roadmap-topic-check--done' : ''}`}>{topicPercent === 100 ? <Icon name="check" size={12}/> : ''}</span><span><strong>{cleanHeading(topic.title)}</strong><small>{section.title}</small></span><span className="roadmap-topic-progress">{itemDone}/{topic.items.length}</span><Icon name="arrow" size={14}/></button>;
        })}</div>}
      </article>;
    })}</div>
  </div>;
}

function Dashboard({ catalog, profile, stats, completedSections, activeTopics, nextItem, onOpen, onContinue, completed, reviewItems, sessions, activeSession, clock, todayMinutes, totalMinutes, studyStreak, preferences, reminderMessage, onUpdatePreferences, onSetReminder, onStartSession, onFinishSession, onReviewItem, onOpenFlashcards }) {
  const elapsed = activeSession ? Math.floor((clock - activeSession) / 1000) : 0;
  const recentSessions = [...sessions].slice(-5).reverse();
  return <div className="page-content dashboard-page">
    <section className="welcome-row">
      <div>
        <div className="eyebrow"><span className="eyebrow-mark"/> YOUR LEARNING WORKSPACE</div>
        <h1>Build depth, one concept at a time.</h1>
        <p className="welcome-subtitle">A focused path through the systems and engineering skills behind senior backend work.</p>
      </div>
      <button className="primary-button continue-button" onClick={onContinue} disabled={!nextItem}>
        <span>{stats.done ? 'Continue learning' : 'Start learning'}</span><Icon name="arrow" size={17}/>
      </button>
    </section>

    <section className="summary-grid" aria-label="Learning progress summary">
      <article className="summary-card summary-card--lead">
        <div className="summary-card-top"><span className="summary-label">Overall progress</span><span className="summary-icon"><Icon name="spark" size={17}/></span></div>
        <div className="overall-row"><div className="overall-number">{stats.percent}<span>%</span></div><div className="progress-ring" role="img" aria-label={`${stats.percent}% complete`} style={{ '--p': `${stats.percent * 3.6}deg` }}><i/></div></div>
        <div className="summary-foot"><span>{fmt.format(stats.done)} topics completed</span><span>{fmt.format(stats.total)} total</span></div>
      </article>
      <article className="summary-card">
        <div className="summary-card-top"><span className="summary-label">Sections completed</span><span className="summary-icon"><Icon name="check" size={17}/></span></div>
        <div className="summary-number">{completedSections}<span> / {catalog.sections.length}</span></div>
        <p className="summary-caption">Full curriculum areas</p>
      </article>
      <article className="summary-card">
        <div className="summary-card-top"><span className="summary-label">In progress</span><span className="summary-icon"><Icon name="book" size={17}/></span></div>
        <div className="summary-number">{activeTopics}<span> topics</span></div>
        <p className="summary-caption">Started, with more to explore</p>
      </article>
    </section>

    <section className="curriculum-heading">
      <div><div className="eyebrow eyebrow--muted">THE CURRICULUM</div><h2>Your backend engineering map</h2><p>Explore a section, mark topics as you learn, and pick up where you left off.</p></div>
      <span className="curriculum-total"><Icon name="check" size={15}/>{fmt.format(stats.done)} / {fmt.format(stats.total)} done</span>
    </section>

    <section className="curriculum-grid">
      {catalog.sections.map((section, index) => {
        const sectionStats = getStats(section, completed);
        const firstTopic = section.topics.find((topic) => topic.items.some((item) => !completed.has(item.id))) || section.topics[0];
        return <button key={section.id} className={`curriculum-card curriculum-card--${index + 1}`} onClick={() => onOpen(section.id)}>
          <div className="curriculum-card-top"><span className={`section-number section-number--${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><span className="card-open"><Icon name="arrow" size={16}/></span></div>
          <h3>{section.title}</h3>
          <p>{section.topicCount} learning units <span>·</span> {fmt.format(sectionStats.total)} tracked items</p>
          <div className="card-progress-label"><span>Progress</span><strong>{sectionStats.percent}%</strong></div>
          <ProgressBar value={sectionStats.percent} muted/>
          <div className="card-bottom"><span>{fmt.format(sectionStats.done)} of {fmt.format(sectionStats.total)} complete</span>{firstTopic && <span className="card-next">{sectionStats.percent === 100 ? 'Review section' : 'Open section'} <Icon name="arrow" size={14}/></span>}</div>
        </button>;
      })}
    </section>
    <section className="today-heading"><div className="eyebrow eyebrow--muted">TODAY</div><h2>Study tools</h2></section>
    <section className="study-tools-grid" aria-label="Study tools">
      <article className="study-tool-card study-session-card">
        <div className="study-tool-heading"><div><div className="eyebrow eyebrow--muted">FOCUS TIME</div><h2>Study session</h2></div><span className="study-today">Today · {todayMinutes} min</span></div>
        <div className="study-clock">{String(Math.floor(elapsed / 3600)).padStart(2, '0')}:{String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</div>
        <p>{activeSession ? 'Session in progress. Your time is saved locally.' : `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m studied in total`}</p>
        <button className={`primary-button session-button ${activeSession ? 'session-button--stop' : ''}`} onClick={activeSession ? onFinishSession : onStartSession}>{activeSession ? 'Finish session' : 'Start study session'}</button>
        {recentSessions.length > 0 && <div className="recent-sessions"><strong>Recent sessions</strong>{recentSessions.slice(0, 3).map((session, index) => <span key={`${session.endedAt}-${index}`}>{session.date} <b>{session.minutes} min</b></span>)}</div>}
      </article>
      <article className="study-tool-card review-card">
        <div className="study-tool-heading"><div><div className="eyebrow eyebrow--muted">SPACED REVIEW</div><h2>Review reminders</h2></div><span className="review-count">{reviewItems.length} due</span></div>
        <p className="review-intro">Mark uncertain topics, then use spaced repetition to strengthen recall.</p><button className="flashcard-dashboard-link" onClick={onOpenFlashcards}>Open flashcard review →</button>
        {reviewItems.length ? <div className="review-list">{reviewItems.slice(0, 4).map((item) => <button key={item.id} onClick={() => onReviewItem(item)}><span><strong>{item.text}</strong><small>{item.topic.title} · {item.section.title}</small></span><Icon name="arrow" size={15}/></button>)}</div> : <div className="review-empty"><span className="review-check"><Icon name="check" size={14}/></span><span>No reviews due. Mark an item “Need review” while studying.</span></div>}
      </article>
      <article className="study-tool-card routine-card">
        <div className="study-tool-heading"><div><div className="eyebrow eyebrow--muted">STUDY ROUTINE</div><h2>Daily target</h2></div><span className="study-today">🔥 {studyStreak} day streak</span></div>
        <div className="goal-summary"><strong>{todayMinutes}<small> / {preferences.dailyGoalMinutes || 90} min</small></strong><span>{todayMinutes >= (preferences.dailyGoalMinutes || 90) ? 'Daily target reached' : `${Math.max(0,(preferences.dailyGoalMinutes || 90)-todayMinutes)} minutes to go`}</span></div>
        <ProgressBar value={Math.min(100,Math.round(todayMinutes/(preferences.dailyGoalMinutes || 90)*100))} muted/>
        <details className="goal-details"><summary>Goal & reminder settings</summary><div className="goal-settings"><label>Daily minutes<MinutesInput value={preferences.dailyGoalMinutes || 90} onCommit={(minutes) => onUpdatePreferences({dailyGoalMinutes:minutes})}/></label><label>Reminder time<input type="time" value={preferences.reminderTime || '19:00'} onChange={(event) => onUpdatePreferences({reminderTime:event.target.value})}/></label></div>
        <button className="reminder-button" onClick={() => onSetReminder(!preferences.reminderEnabled)}>{preferences.reminderEnabled ? 'Turn daily reminder off' : 'Enable daily reminder'}</button>
        <p className="reminder-footnote">Reminder notifications appear while this app is open. {reminderMessage}</p></details>
      </article>
    </section>
    
    <footer className="dashboard-footer"><span>Welcome, {profile?.name || 'learner'}.</span><span>Your progress stays on this device.</span></footer>
  </div>;
}

function SectionView({ section, catalog, completed, onToggle, itemData, onUpdateItem, onOpenPrerequisite, expandedTopicId, setExpandedTopicId, search, setSearch, filter, setFilter, searchRef, onBack }) {
  const [openItem, setOpenItem] = useState(null);
  const stats = getStats(section, completed);
  const query = search.trim().toLowerCase();
  const filteredTopics = section.topics.map((topic) => {
    const matches = topic.items.filter((item) => {
      const matchesSearch = !query || item.text.toLowerCase().includes(query) || topic.title.toLowerCase().includes(query);
      const isDone = completed.has(item.id);
      const matchesFilter = filter === 'all' || (filter === 'done' && isDone) || (filter === 'todo' && !isDone);
      return matchesSearch && matchesFilter;
    });
    const titleMatches = !query || topic.title.toLowerCase().includes(query);
    const filterOnly = topic.items.filter((item) => filter === 'all' || (filter === 'done' && completed.has(item.id)) || (filter === 'todo' && !completed.has(item.id)));
    return { ...topic, visibleItems: titleMatches ? filterOnly : matches };
  }).filter((topic) => (topic.visibleItems.length > 0 || (!query && filter === 'all' && topic.items.length === 0)) && (!query || topic.title.toLowerCase().includes(query) || topic.visibleItems.length));

  const next = section.topics.flatMap((topic) => topic.items.map((item) => ({ topic, item }))).find(({ item }) => !completed.has(item.id));
  return <div className="page-content section-page">
    <div className="section-intro">
      <div className="section-intro-main">
        <button className="back-link" onClick={onBack}><span>CURRICULUM</span><b>/</b><strong>{section.title}</strong></button>
        <div className="eyebrow"><span className="eyebrow-mark"/> SECTION TRACKER</div>
        <h1>{section.title}</h1>
        <p>Work through each study area, question, and practical exercise. Your progress saves automatically.</p>
      </div>
      <div className="section-progress-card">
        <span className="summary-label">Section progress</span>
        <strong>{stats.percent}<small>%</small></strong>
        <ProgressBar value={stats.percent}/>
        <div className="summary-foot"><span>{stats.done} complete</span><span>{stats.total - stats.done} remaining</span></div>
      </div>
    </div>

    <div className="section-toolbar">
      <label className="search-field"><Icon name="search" size={18}/><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a topic or question"/><kbd>⌘ K</kbd></label>
      <div className="filter-tabs" role="group" aria-label="Filter learning items">
        {[['all','All'],['todo','To do'],['done','Done']].map(([value,label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <span className="result-count">{filteredTopics.length} learning units</span>
    </div>

    <div className="unit-list">
      {filteredTopics.map((topic, index) => {
        const prerequisites = resolvePrerequisites(catalog, section.id, topic.id);
        const learningNote = resolveTopicContent(catalog,section.id,topic.id);
        const prerequisiteProgress = prerequisites.map(({ section:prerequisiteSection, topic:prerequisiteTopic }) => {
          const done = prerequisiteTopic.items.filter((item) => completed.has(item.id)).length;
          return { section:prerequisiteSection, topic:prerequisiteTopic, done, total:prerequisiteTopic.items.length, complete:prerequisiteTopic.items.length > 0 && done === prerequisiteTopic.items.length };
        });
        const doneCount = topic.items.filter((item) => completed.has(item.id)).length;
        const isOpen = expandedTopicId === topic.id || (!!query && topic.visibleItems.length > 0);
        const percent = topic.items.length ? Math.round((doneCount / topic.items.length) * 100) : 0;
        return <article className={`unit-card ${isOpen ? 'unit-card--open' : ''}`} id={`topic-${topic.id}`} key={topic.id}>
          <button className="unit-header" onClick={() => setExpandedTopicId(isOpen && !query ? null : topic.id)} aria-expanded={isOpen}>
            <span className={`unit-index ${percent === 100 ? 'unit-index--done' : ''}`}>{percent === 100 ? <Icon name="check" size={15}/> : String(index + 1).padStart(2, '0')}</span>
            <span className="unit-copy"><strong>{cleanHeading(topic.title)}</strong>{topic.description && <small>{topic.description}</small>}</span>
            <span className="unit-count">{doneCount}/{topic.items.length}</span>
            <span className="unit-chevron"><Icon name="chevron" size={17}/></span>
          </button>
          {isOpen && <div className="unit-content">
            {learningNote && <aside className="topic-learning-card"><div className="topic-learning-label">QUICK STUDY NOTE</div><h3>{learningNote.title}</h3><p>{learningNote.explanation}</p><div className="topic-example"><strong>Example</strong><span>{learningNote.example}</span></div>{learningNote.resources.length > 0 && <div className="topic-resources"><strong>Official references</strong>{learningNote.resources.map(([label,url])=><a key={url} href={url} target="_blank" rel="noreferrer">{label} ↗</a>)}</div>}</aside>}
            {prerequisiteProgress.length > 0 && <section className="prerequisite-panel"><div className="prerequisite-panel-title"><strong>Recommended first</strong><span>{prerequisiteProgress.every((entry) => entry.complete) ? 'Prerequisites complete' : `${prerequisiteProgress.filter((entry) => entry.complete).length} of ${prerequisiteProgress.length} complete`}</span></div><div className="prerequisite-links">{prerequisiteProgress.map((entry) => <button key={`${entry.section.id}-${entry.topic.id}`} onClick={() => onOpenPrerequisite(entry.section.id,entry.topic.id)}><span className={`prerequisite-status ${entry.complete ? 'prerequisite-status--done' : ''}`}>{entry.complete ? <Icon name="check" size={11}/> : ''}</span><span><strong>{cleanHeading(entry.topic.title)}</strong><small>{entry.section.title}</small></span><b>{entry.done}/{entry.total}</b><Icon name="arrow" size={13}/></button>)}</div></section>}
            {topic.description && <p className="unit-description">{topic.description}</p>}
            {topic.items.length > 0 ? topic.visibleItems.map((item) => {
              const details = itemData[item.id] || {};
              const isDue = details.reviewAt && details.reviewAt <= Date.now();
              const showTools = openItem === item.id || !!(details.confidence || details.reviewAt || details.note);
              return <div className={`learning-item-wrap ${completed.has(item.id) ? 'learning-item-wrap--done' : ''}`} key={item.id}>
                <label className={`learning-item ${completed.has(item.id) ? 'learning-item--done' : ''}`}>
                  <input type="checkbox" checked={completed.has(item.id)} onChange={() => onToggle(item.id)}/><span className="custom-check"><Icon name="check" size={13}/></span>
                  <span className="learning-item-text">{item.text}</span><span className={`item-kind item-kind--${item.kind.toLowerCase()}`}>{item.kind}</span>
                </label>
                <button type="button" className="item-tools-toggle" aria-expanded={showTools} aria-label={`Study tools for ${item.text}`} onClick={() => setOpenItem(showTools ? null : item.id)}>{showTools ? '–' : '⋯'}</button>
                {showTools && <div className="item-learning-tools">
                  <label className="confidence-control"><span>Confidence</span><select aria-label={`Confidence for ${item.text}`} value={details.confidence || ''} onChange={(event) => onUpdateItem(item.id, { confidence: event.target.value })}><option value="">Rate confidence</option><option value="learning">Learning</option><option value="practicing">Practicing</option><option value="confident">Confident</option></select></label>
                  <button className={`review-toggle ${details.reviewAt ? 'review-toggle--active' : ''}`} onClick={() => onUpdateItem(item.id, { reviewAt: details.reviewAt ? null : Date.now() + 3 * 24 * 60 * 60 * 1000 })}>{details.reviewAt ? (isDue ? 'Review due · clear' : 'Review scheduled · clear') : 'Need review · in 3 days'}</button>
                  <ItemNote label={item.text} value={details.note || ''} onChange={(note) => onUpdateItem(item.id, { note })}/>
                </div>}
              </div>;
            }) : <div className="empty-unit">This section is a reference overview. Its subtopics are tracked below.</div>}
          </div>}
        </article>;
      })}
      {!filteredTopics.length && <div className="empty-state"><span className="empty-icon"><Icon name="search" size={23}/></span><h3>No matching topics</h3><p>Try a shorter search or change the progress filter.</p><button className="text-button" onClick={() => { setSearch(''); setFilter('all'); }}>Clear search and filters</button></div>}
    </div>

    <div className="section-end-card">
      <span className="finish-mark"><Icon name="check" size={18}/></span>
      <div><strong>{stats.percent === 100 ? 'Section complete' : 'Keep the momentum'}</strong><p>{stats.percent === 100 ? 'You have marked every item in this section as complete.' : `${next ? `${next.item.text}` : 'You are all caught up.'}`}</p></div>
      <span className="finish-percent">{stats.percent}%</span>
    </div>
  </div>;
}

function cleanHeading(title) {
  return title.replace(/^\d+(?:\.\d+)*[.)]?\s*/, '').replace(/^[A-D]\.\s*/, '').trim();
}

export default App;
