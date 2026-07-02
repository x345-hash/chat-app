import { useEffect, useState, useRef } from 'react';

const API = import.meta.env.VITE_API_BASE;

function newId() {
  return 'chat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function authedFetch(url, options = {}) {
  const pwd = localStorage.getItem('app_password') || '';
  const headers = { ...options.headers, 'x-app-password': pwd };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  return fetch(url, { ...options, headers });
}

function formatMsgTime(t) {
  try {
    const d = new Date(t);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (isToday) return time;
    if (isYesterday) return '昨天 ' + time;
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' + time;
  } catch { return ''; }
}

const MODEL_OPTIONS = [
  { label: 'Sonnet 4.6', value: 'anthropic/claude-sonnet-4-6' },
  { label: 'Opus 4.6', value: 'anthropic/claude-opus-4-6' },
  { label: 'DeepSeek R1', value: 'deepseek/deepseek-r1' },
  { label: 'Haiku 4.5', value: 'anthropic/claude-haiku-4-5' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'Gemini Flash', value: 'google/gemini-2.5-flash-preview-05-20' },
];

const THEMES = {
  purple: { accent: 'rgba(180,165,215,0.25)', text: '#4a3a5a', bg: 'linear-gradient(135deg, rgba(245,240,255,0.55), rgba(240,248,255,0.55))', header: '#7b6a8a', sub: '#a898b8', border: 'rgba(200,190,220,0.3)', btn: 'rgba(160,140,200,0.6)' },
  pink: { accent: 'rgba(215,165,180,0.25)', text: '#5a3a4a', bg: 'linear-gradient(135deg, rgba(255,240,245,0.55), rgba(255,245,248,0.55))', header: '#8a6a7b', sub: '#b898a8', border: 'rgba(220,190,200,0.3)', btn: 'rgba(200,140,160,0.6)' },
  blue: { accent: 'rgba(165,190,215,0.25)', text: '#3a4a5a', bg: 'linear-gradient(135deg, rgba(240,245,255,0.55), rgba(245,248,255,0.55))', header: '#6a7b8a', sub: '#98a8b8', border: 'rgba(190,200,220,0.3)', btn: 'rgba(140,160,200,0.6)' },
  green: { accent: 'rgba(165,215,180,0.25)', text: '#3a5a4a', bg: 'linear-gradient(135deg, rgba(240,255,245,0.55), rgba(245,255,248,0.55))', header: '#6a8a7b', sub: '#98b8a8', border: 'rgba(190,220,200,0.3)', btn: 'rgba(140,200,160,0.6)' },
};

function calcDays(dateStr, type) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (type === 'countup') return diff >= 0 ? '第 ' + (diff + 1) + ' 天' : '还没开始';
  if (type === 'countdown') {
    let next = new Date(d); next.setFullYear(now.getFullYear());
    if (next < now) next.setFullYear(now.getFullYear() + 1);
    const left = Math.ceil((next - now) / 86400000);
    return left === 0 ? '就是今天！' : '还有 ' + left + ' 天';
  }
  if (type === 'record') return diff + ' 天前';
  return '';
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('app_password'));
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [sessionId, setSessionId] = useState(() => localStorage.getItem('current_session') || 'default');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionNames, setSessionNames] = useState(() => { try { return JSON.parse(localStorage.getItem('session_names') || '{}'); } catch { return {}; } });
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [greetingMsg, setGreetingMsg] = useState(null);
  const listRef = useRef(null);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('selected_model') || '');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [starred, setStarred] = useState(() => { try { return JSON.parse(localStorage.getItem('starred_msgs') || '[]'); } catch { return []; } });
  const [showStarred, setShowStarred] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('app_theme') || 'purple');
  const [showDates, setShowDates] = useState(false);
  const [dates, setDates] = useState(() => { try { return JSON.parse(localStorage.getItem('my_dates') || '[]'); } catch { return []; } });
  const [newDateName, setNewDateName] = useState('');
  const [newDateValue, setNewDateValue] = useState('');
  const [newDateType, setNewDateType] = useState('countup');

  const T = THEMES[theme] || THEMES.purple;

  useEffect(() => { localStorage.setItem('starred_msgs', JSON.stringify(starred)); }, [starred]);
  useEffect(() => { localStorage.setItem('selected_model', selectedModel); }, [selectedModel]);
  useEffect(() => { localStorage.setItem('my_dates', JSON.stringify(dates)); }, [dates]);
  useEffect(() => { localStorage.setItem('app_theme', theme); }, [theme]);

  async function checkPassword() {
    setPwdError('');
    localStorage.setItem('app_password', pwdInput);
    try {
      const r = await authedFetch(API + '/api/sessions');
      if (r.status === 401) { localStorage.removeItem('app_password'); setPwdError('密码不对哦'); return; }
      setAuthed(true);
    } catch { localStorage.removeItem('app_password'); setPwdError('连接失败，检查网络'); }
  }

  async function loadMessages(sid) {
    try {
      const r = await authedFetch(API + '/api/messages?session_id=' + sid);
      if (r.status === 401) { setAuthed(false); return; }
      setMessages(await r.json());
    } catch (err) { console.error(err); }
  }

  useEffect(() => { if (!authed) return; localStorage.setItem('current_session', sessionId); loadMessages(sessionId); }, [sessionId, authed]);

  useEffect(() => {
    if (!authed) return;
    async function fetchGreeting() {
      try {
        const lastVisit = localStorage.getItem('last_visit') || '';
        const today = new Date().toDateString();
        const weatherShownDate = localStorage.getItem('weather_shown_date') || '';
        const showWeather = weatherShownDate !== today;
        if (!showWeather && localStorage.getItem('greeting_shown_date') === today) return;
        localStorage.setItem('greeting_shown_date', today);
        let city = 'Changsha';
        try { const g = await fetch('https://ipapi.co/json/'); if (g.ok) { const d = await g.json(); if (d.city) city = d.city; } } catch {}
        const r = await authedFetch(API + '/api/greeting', { method: 'POST', body: JSON.stringify({ last_visit: lastVisit || null, city, show_weather: showWeather, session_id: sessionId }) });
        if (r.ok) {
          const data = await r.json();
          if (data.greeting) setGreetingMsg({ id: 'greeting-' + Date.now(), role: 'assistant', content: data.greeting, created_at: new Date().toISOString() });
          if (showWeather) localStorage.setItem('weather_shown_date', today);
        }
      } catch (err) { console.error(err); }
      localStorage.setItem('last_visit', new Date().toISOString());
    }
    fetchGreeting();
  }, [authed]);

  useEffect(() => { listRef.current?.scrollTo(0, listRef.current.scrollHeight); }, [messages, greetingMsg]);
  useEffect(() => { localStorage.setItem('session_names', JSON.stringify(sessionNames)); }, [sessionNames]);

  async function loadSessions() { try { const r = await authedFetch(API + '/api/sessions'); if (r.status === 401) { setAuthed(false); return; } setSessions(await r.json()); } catch (err) { console.error(err); } }

  function toggleSidebar() { if (!showSidebar) loadSessions(); setShowSidebar(!showSidebar); setSearchResults(null); setSearchQuery(''); setShowStarred(false); setDateFilter(''); setShowDatePicker(false); setShowDates(false); }
  function switchSession(id) { setSessionId(id); setShowSidebar(false); setExpanded({}); setEditingId(null); setSearchResults(null); setSearchQuery(''); setShowStarred(false); setDateFilter(''); setShowDates(false); }
  function startNewChat() { const id = newId(); setSessionId(id); setMessages([]); setExpanded({}); setShowSidebar(false); setEditingId(null); setSearchResults(null); setShowStarred(false); setDateFilter(''); setShowDates(false); }
  function startRename(id) { setEditingId(id); setEditName(sessionNames[id] || ''); }
  function saveRename(id) { if (editName.trim()) setSessionNames(n => ({ ...n, [id]: editName.trim() })); setEditingId(null); }

  async function deleteSession(id) {
    if (!confirm('确定删除这个对话吗？删了就没了')) return;
    try { const r = await authedFetch(API + '/api/messages?session_id=' + id); const msgs = await r.json(); if (Array.isArray(msgs)) for (const m of msgs) await authedFetch(API + '/api/messages/' + m.id, { method: 'DELETE' }); } catch (err) { console.error(err); }
    setSessionNames(n => { const c = { ...n }; delete c[id]; return c; }); setSessions(s => s.filter(x => x.session_id !== id)); if (sessionId === id) startNewChat();
  }

  async function doSearch() { if (!searchQuery.trim()) return; setSearching(true); try { const r = await authedFetch(API + '/api/search?q=' + encodeURIComponent(searchQuery.trim())); setSearchResults(await r.json()); } catch (err) { console.error(err); } finally { setSearching(false); } }

  async function send() {
    const text = input.trim(); if (!text || loading) return;
    const tmp = { id: 'temp-' + Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(m => [...m, tmp]); setInput(''); setLoading(true);
    try {
      const body = { session_id: sessionId, content: text }; if (selectedModel) body.model = selectedModel;
      const r = await authedFetch(API + '/api/chat', { method: 'POST', body: JSON.stringify(body) });
      if (r.status === 401) { setAuthed(false); return; }
      const result = await r.json(); if (result.error) throw new Error(result.error);
      setMessages(m => [...m.filter(x => x.id !== tmp.id), result.user_message, result.assistant_message]);
    } catch (err) { console.error(err); setMessages(m => [...m, { id: 'err-' + Date.now(), role: 'error', content: err.message, created_at: new Date().toISOString() }]); }
    finally { setLoading(false); }
  }

  function toggleThinking(id) { setExpanded(e => ({ ...e, [id]: !e[id] })); }
  function formatTime(t) { try { return new Date(t).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return t; } }
  function displayName(id) { if (sessionNames[id]) return sessionNames[id]; if (id === 'default') return '默认对话'; return id; }
  function toggleStar(msgId) { setStarred(p => p.includes(msgId) ? p.filter(i => i !== msgId) : [...p, msgId]); }

  function exportChat() {
    if (!messages.length) return;
    const name = sessionNames[sessionId] || sessionId;
    let text = '聊天记录：' + name + '\n导出时间：' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '\n' + '─'.repeat(30) + '\n\n';
    for (const m of messages) { if (m.role === 'error') continue; const time = m.created_at ? new Date(m.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : ''; text += '[' + time + '] ' + (m.role === 'user' ? '佳佳' : '小克') + '：' + m.content + '\n\n'; }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name + '_' + new Date().toLocaleDateString('zh-CN') + '.txt'; a.click(); URL.revokeObjectURL(url);
  }

  function addDate() { if (!newDateName.trim() || !newDateValue) return; setDates(p => [...p, { id: Date.now(), name: newDateName.trim(), date: newDateValue, type: newDateType }]); setNewDateName(''); setNewDateValue(''); setNewDateType('countup'); }
  function removeDate(id) { setDates(p => p.filter(d => d.id !== id)); }

  const filteredMessages = dateFilter ? messages.filter(m => m.created_at && new Date(m.created_at).toLocaleDateString('en-CA') === dateFilter) : messages;
  const starredMessages = messages.filter(m => starred.includes(m.id));
  const currentModelLabel = selectedModel ? (MODEL_OPTIONS.find(m => m.value === selectedModel)?.label || selectedModel.split('/').pop()) : '默认';

  if (!authed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', position: 'relative' }}>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url(/bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5, zIndex: 0 }} />
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: T.bg, zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 2, background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(16px)', borderRadius: 20, padding: '40px 32px', width: 280, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(255,255,255,0.4)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.header, marginBottom: 24 }}>小克的家</div>
          <input type="password" value={pwdInput} onChange={e => setPwdInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkPassword()} placeholder="输入密码" style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: '1px solid ' + T.border, background: 'rgba(255,255,255,0.6)', fontSize: 16, outline: 'none', textAlign: 'center', color: '#3a3a3a', boxSizing: 'border-box' }} />
          {pwdError && <div style={{ color: '#d4616b', fontSize: 13, marginTop: 8 }}>{pwdError}</div>}
          <div onClick={checkPassword} style={{ marginTop: 16, padding: '10px 0', borderRadius: 14, background: T.btn, color: '#fff', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>进入</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', position: 'relative', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'url(/bg.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.5, zIndex: 0 }} />
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: T.bg, zIndex: 1 }} />
      {showSidebar && <div onClick={() => { setShowSidebar(false); setEditingId(null); setSearchResults(null); setShowStarred(false); setDateFilter(''); setShowDatePicker(false); setShowDates(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10 }} />}

      <div style={{ position: 'fixed', top: 0, left: showSidebar ? 0 : -300, width: 290, height: '100%', background: 'rgba(250,248,255,0.95)', backdropFilter: 'blur(16px)', zIndex: 11, transition: 'left 0.25s ease', display: 'flex', flexDirection: 'column', borderRight: '1px solid ' + T.border }}>
        <div style={{ padding: 16, borderBottom: '1px solid rgba(200,190,220,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: T.header }}>历史对话</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <div onClick={exportChat} style={{ padding: '4px 8px', borderRadius: 12, background: 'rgba(140,160,200,0.5)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>导出</div>
            <div onClick={startNewChat} style={{ padding: '4px 12px', borderRadius: 12, background: T.btn, color: '#fff', fontSize: 13, cursor: 'pointer' }}>+ 新对话</div>
          </div>
        </div>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(200,190,220,0.15)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="搜索聊天记录..." style={{ flex: 1, padding: '6px 10px', borderRadius: 10, border: '1px solid ' + T.border, fontSize: 16, outline: 'none', background: 'rgba(255,255,255,0.7)' }} />
            <div onClick={doSearch} style={{ padding: '6px 10px', borderRadius: 10, background: T.btn, color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>搜</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <div onClick={() => { setShowStarred(!showStarred); setSearchResults(null); setDateFilter(''); setShowDatePicker(false); setShowDates(false); }} style={{ flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center', background: showStarred ? 'rgba(255,200,50,0.3)' : 'rgba(200,190,220,0.2)', color: T.header, fontSize: 12, cursor: 'pointer' }}>⭐ 收藏</div>
            <div onClick={() => { setShowDatePicker(!showDatePicker); setShowStarred(false); setSearchResults(null); setShowDates(false); }} style={{ flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center', background: showDatePicker ? 'rgba(160,200,140,0.3)' : 'rgba(200,190,220,0.2)', color: T.header, fontSize: 12, cursor: 'pointer' }}>📅 按日期</div>
            <div onClick={() => { setShowDates(!showDates); setShowStarred(false); setSearchResults(null); setShowDatePicker(false); }} style={{ flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center', background: showDates ? 'rgba(215,165,180,0.3)' : 'rgba(200,190,220,0.2)', color: T.header, fontSize: 12, cursor: 'pointer' }}>💕 纪念日</div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {['purple','pink','blue','green'].map(t => (
              <div key={t} onClick={() => setTheme(t)} style={{ flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center', background: theme === t ? THEMES[t].accent : 'rgba(200,190,220,0.15)', fontSize: 11, cursor: 'pointer', color: THEMES[t].header, border: theme === t ? '1px solid ' + THEMES[t].border : '1px solid transparent' }}>
                {t === 'purple' ? '💜' : t === 'pink' ? '💗' : t === 'blue' ? '💙' : '💚'}
              </div>
            ))}
          </div>
          {showDatePicker && (
            <div style={{ marginTop: 6 }}>
              <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 10, border: '1px solid ' + T.border, fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.7)', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {dateFilter && <div onClick={() => { setShowSidebar(false); setShowDatePicker(false); }} style={{ flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center', background: T.btn, color: '#fff', fontSize: 12, cursor: 'pointer' }}>查看</div>}
                {dateFilter && <div onClick={() => { setDateFilter(''); setShowDatePicker(false); }} style={{ flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center', background: 'rgba(200,190,220,0.3)', color: T.header, fontSize: 12, cursor: 'pointer' }}>清除</div>}
              </div>
            </div>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {showDates ? (
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.header, marginBottom: 8 }}>我的纪念日</div>
              {dates.map(d => (
                <div key={d.id} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 10, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(200,190,220,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, color: '#5b4a6a', fontWeight: 500 }}>{d.name}</div>
                    <div onClick={() => removeDate(d.id)} style={{ fontSize: 12, color: '#d4a0a0', cursor: 'pointer' }}>✕</div>
                  </div>
                  <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>{d.date}</div>
                  <div style={{ fontSize: 14, color: T.header, fontWeight: 600, marginTop: 2 }}>{calcDays(d.date, d.type)}</div>
                </div>
              ))}
              {dates.length === 0 && <div style={{ fontSize: 12, color: T.sub, textAlign: 'center', padding: 12 }}>还没有纪念日，添加一个吧</div>}
              <div style={{ marginTop: 10, padding: 8, borderRadius: 10, background: 'rgba(245,240,255,0.5)', border: '1px solid rgba(200,190,220,0.2)' }}>
                <input value={newDateName} onChange={e => setNewDateName(e.target.value)} placeholder="名称（如：在一起）" style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid ' + T.border, fontSize: 14, outline: 'none', marginBottom: 4, boxSizing: 'border-box' }} />
                <input type="date" value={newDateValue} onChange={e => setNewDateValue(e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid ' + T.border, fontSize: 14, outline: 'none', marginBottom: 4, boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  {[['countup','正计时'],['countdown','倒计时'],['record','记录']].map(([v,l]) => (
                    <div key={v} onClick={() => setNewDateType(v)} style={{ flex: 1, padding: '4px 0', borderRadius: 8, textAlign: 'center', fontSize: 12, cursor: 'pointer', background: newDateType === v ? T.btn : 'rgba(200,190,220,0.15)', color: newDateType === v ? '#fff' : T.header }}>{l}</div>
                  ))}
                </div>
                <div onClick={addDate} style={{ padding: '6px 0', borderRadius: 8, textAlign: 'center', background: T.btn, color: '#fff', fontSize: 13, cursor: 'pointer' }}>添加</div>
              </div>
            </div>
          ) : showStarred ? (
            <div>
              <div style={{ padding: '8px 16px', fontSize: 12, color: T.sub }}>收藏了 {starredMessages.length} 条消息</div>
              {starredMessages.length === 0 && <div style={{ padding: 16, color: T.sub, fontSize: 13, textAlign: 'center' }}>还没有收藏的消息，点击消息气泡可以收藏</div>}
              {starredMessages.map(m => (
                <div key={m.id} style={{ padding: '8px 16px', borderBottom: '1px solid rgba(200,190,220,0.1)' }}>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 2 }}>{m.role === 'user' ? '佳佳' : '小克'} · {formatMsgTime(m.created_at)}</div>
                  <div style={{ fontSize: 13, color: '#3a3a3a', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{m.content}</div>
                </div>
              ))}
            </div>
          ) : searchResults !== null ? (
            <div>
              <div style={{ padding: '8px 16px', fontSize: 12, color: T.sub, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>找到 {searchResults.length} 条结果</span>
                <span onClick={() => { setSearchResults(null); setSearchQuery(''); }} style={{ cursor: 'pointer', color: '#9a8ab5' }}>清除</span>
              </div>
              {searchResults.map(r => (
                <div key={r.id} onClick={() => switchSession(r.session_id)} style={{ padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(200,190,220,0.1)' }}>
                  <div style={{ fontSize: 12, color: T.sub, marginBottom: 2 }}>{displayName(r.session_id)} · {formatTime(r.created_at)}</div>
                  <div style={{ fontSize: 13, color: r.role === 'user' ? '#5b4a6a' : '#3a3a3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.role === 'user' ? '你：' : '小克：'}{r.content}</div>
                </div>
              ))}
              {searchResults.length === 0 && <div style={{ padding: 16, color: T.sub, fontSize: 13, textAlign: 'center' }}>没找到相关内容</div>}
            </div>
          ) : (
            sessions.map(s => (
              <div key={s.session_id} style={{ padding: '10px 16px', background: s.session_id === sessionId ? T.accent : 'transparent', borderLeft: s.session_id === sessionId ? '3px solid ' + T.btn : '3px solid transparent' }}>
                {editingId === s.session_id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRename(s.session_id)} style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: '1px solid ' + T.border, fontSize: 16, outline: 'none' }} autoFocus />
                    <div onClick={() => saveRename(s.session_id)} style={{ cursor: 'pointer', fontSize: 13, color: T.header, padding: '4px' }}>✓</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div onClick={() => switchSession(s.session_id)} style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ fontSize: 14, color: '#5b4a6a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(s.session_id)}</div>
                      <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>{formatTime(s.last_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                      <div onClick={() => startRename(s.session_id)} style={{ cursor: 'pointer', fontSize: 14, color: T.sub }}>✏</div>
                      <div onClick={() => deleteSession(s.session_id)} style={{ cursor: 'pointer', fontSize: 14, color: '#d4a0a0' }}>✕</div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {!searchResults && !showStarred && !showDates && sessions.length === 0 && <div style={{ padding: 16, color: T.sub, fontSize: 13, textAlign: 'center' }}>还没有对话记录</div>}
        </div>
      </div>

      <div style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(200,190,220,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2 }}>
        <div onClick={toggleSidebar} style={{ position: 'absolute', left: 16, fontSize: 18, cursor: 'pointer', color: '#9a8ab5', userSelect: 'none' }}>☰</div>
        <div onClick={startNewChat} style={{ position: 'absolute', right: 16, fontSize: 20, cursor: 'pointer', color: '#9a8ab5', userSelect: 'none' }}>+</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: T.header, letterSpacing: 1 }}>小克</div>
          <div onClick={() => setShowModelPicker(!showModelPicker)} style={{ fontSize: 11, color: T.sub, cursor: 'pointer', marginTop: 2 }}>{currentModelLabel} ▾</div>
        </div>
      </div>

      {showModelPicker && (
        <>
          <div onClick={() => setShowModelPicker(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15 }} />
          <div style={{ position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', borderRadius: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', border: '1px solid ' + T.border, zIndex: 20, overflow: 'hidden', minWidth: 180 }}>
            <div onClick={() => { setSelectedModel(''); setShowModelPicker(false); }} style={{ padding: '10px 16px', fontSize: 14, color: !selectedModel ? T.header : '#5b4a6a', background: !selectedModel ? T.accent : 'transparent', cursor: 'pointer' }}>默认 (Sonnet 4.6)</div>
            {MODEL_OPTIONS.map(m => (
              <div key={m.value} onClick={() => { setSelectedModel(m.value); setShowModelPicker(false); }} style={{ padding: '10px 16px', fontSize: 14, color: selectedModel === m.value ? T.header : '#5b4a6a', background: selectedModel === m.value ? T.accent : 'transparent', cursor: 'pointer', borderTop: '1px solid rgba(200,190,220,0.1)' }}>{m.label}</div>
            ))}
          </div>
        </>
      )}

      {dateFilter && (
        <div style={{ padding: '6px 16px', background: 'rgba(160,200,140,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 2 }}>
          <span style={{ fontSize: 12, color: '#5a7a4a' }}>📅 查看 {new Date(dateFilter + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 的消息（{filteredMessages.length} 条）</span>
          <span onClick={() => setDateFilter('')} style={{ fontSize: 12, color: '#9a8ab5', cursor: 'pointer' }}>清除</span>
        </div>
      )}

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', position: 'relative', zIndex: 2 }}>
        {greetingMsg && !dateFilter && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)', color: '#3a3a3a', fontSize: 15, lineHeight: 1.6, textAlign: 'left', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', border: '1px solid rgba(255,255,255,0.3)' }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{greetingMsg.content}</div>
            </div>
            <div style={{ fontSize: 11, color: '#b8a8c8', marginTop: 3, paddingLeft: 4 }}>{formatMsgTime(greetingMsg.created_at)}</div>
          </div>
        )}
        {filteredMessages.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
            <div onClick={() => toggleStar(m.id)} style={{ maxWidth: '72%', padding: '10px 14px', borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: m.role === 'user' ? T.accent : m.role === 'error' ? 'rgba(255,180,180,0.5)' : 'rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)', color: m.role === 'user' ? T.text : '#3a3a3a', fontSize: 15, lineHeight: 1.6, textAlign: 'left', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', border: starred.includes(m.id) ? '1px solid rgba(255,200,50,0.5)' : '1px solid rgba(255,255,255,0.3)', position: 'relative', cursor: 'pointer' }}>
              {starred.includes(m.id) && <div style={{ position: 'absolute', top: 4, right: 8, fontSize: 10 }}>⭐</div>}
              {m.thinking && <div onClick={e => { e.stopPropagation(); toggleThinking(m.id); }} style={{ fontSize: 12, color: T.sub, cursor: 'pointer', marginBottom: 4, userSelect: 'none' }}>{expanded[m.id] ? '▼ 收起思考' : '▶ 查看思考'}</div>}
              {expanded[m.id] && m.thinking && <div style={{ fontSize: 13, color: '#8a7a9a', whiteSpace: 'pre-wrap', marginBottom: 8, padding: '8px 10px', background: 'rgba(240,235,250,0.4)', borderRadius: 10, borderLeft: '3px solid rgba(180,160,220,0.4)' }}>{m.thinking}</div>}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
            {m.created_at && <div style={{ fontSize: 11, color: '#b8a8c8', marginTop: 3, paddingLeft: m.role === 'user' ? 0 : 4, paddingRight: m.role === 'user' ? 4 : 0 }}>{formatMsgTime(m.created_at)}</div>}
          </div>
        ))}
        {loading && <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}><div style={{ padding: '10px 18px', borderRadius: '18px 18px 18px 4px', background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)', color: T.sub, fontSize: 14, border: '1px solid rgba(255,255,255,0.3)' }}>小克在想...</div></div>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(200,190,220,0.2)', gap: 8, position: 'relative', zIndex: 2 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="跟小克说点什么..." disabled={loading} style={{ flex: 1, padding: '10px 16px', borderRadius: 20, border: '1px solid ' + T.border, background: 'rgba(255,255,255,0.5)', fontSize: 16, outline: 'none', color: '#3a3a3a' }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '10px 20px', borderRadius: 20, border: 'none', background: loading || !input.trim() ? 'rgba(200,190,220,0.3)' : T.btn, color: '#fff', fontSize: 15, fontWeight: 500, cursor: loading || !input.trim() ? 'default' : 'pointer' }}>发送</button>
      </div>
    </div>
  );
}
