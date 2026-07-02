import { useEffect, useState, useRef } from 'react';

const API = import.meta.env.VITE_API_BASE;

function newId() {
  return 'chat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 带密码的 fetch 封装
function authedFetch(url, options = {}) {
  const pwd = localStorage.getItem('app_password') || '';
  const headers = {
    ...options.headers,
    'x-app-password': pwd,
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  return fetch(url, { ...options, headers });
}

// 格式化消息时间
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
    if (isYesterday) return `昨天 ${time}`;
    return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) + ' ' + time;
  } catch { return ''; }
}

// 可选模型列表
const MODEL_OPTIONS = [
  { label: 'Sonnet 4.6', value: 'anthropic/claude-sonnet-4-6' },
  { label: 'Opus 4.6', value: 'anthropic/claude-opus-4-6' },
  { label: 'DeepSeek R1', value: 'deepseek/deepseek-r1' },
  { label: 'Haiku 4.5', value: 'anthropic/claude-haiku-4-5' },
  { label: 'GPT-4o', value: 'openai/gpt-4o' },
  { label: 'Gemini Flash', value: 'google/gemini-2.5-flash-preview-05-20' },
];

export default function App() {
  // 密码状态
  const [authed, setAuthed] = useState(() => {
    return !!localStorage.getItem('app_password');
  });
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState('');

  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('current_session') || 'default';
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionNames, setSessionNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem('session_names') || '{}'); } catch { return {}; }
  });
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [greetingMsg, setGreetingMsg] = useState(null);
  const listRef = useRef(null);

  // 新功能状态
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('selected_model') || '';
  });
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [starred, setStarred] = useState(() => {
    try { return JSON.parse(localStorage.getItem('starred_msgs') || '[]'); } catch { return []; }
  });
  const [showStarred, setShowStarred] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 存储收藏
  useEffect(() => {
    localStorage.setItem('starred_msgs', JSON.stringify(starred));
  }, [starred]);

  // 存储模型选择
  useEffect(() => {
    localStorage.setItem('selected_model', selectedModel);
  }, [selectedModel]);

  // 验证密码
  async function checkPassword() {
    setPwdError('');
    localStorage.setItem('app_password', pwdInput);
    try {
      const r = await authedFetch(`${API}/api/sessions`);
      if (r.status === 401) {
        localStorage.removeItem('app_password');
        setPwdError('密码不对哦');
        return;
      }
      setAuthed(true);
    } catch {
      localStorage.removeItem('app_password');
      setPwdError('连接失败，检查网络');
    }
  }

  // 加载消息
  async function loadMessages(sid) {
    try {
      const r = await authedFetch(`${API}/api/messages?session_id=${sid}`);
      if (r.status === 401) { setAuthed(false); return; }
      const data = await r.json();
      setMessages(data);
    } catch (err) { console.error(err); }
  }

  useEffect(() => {
    if (!authed) return;
    localStorage.setItem('current_session', sessionId);
    loadMessages(sessionId);
  }, [sessionId, authed]);

  // 打开app时获取智能问候
  useEffect(() => {
    if (!authed) return;
    async function fetchGreeting() {
      try {
        const lastVisit = localStorage.getItem('last_visit') || '';
        const today = new Date().toDateString();
        const weatherShownDate = localStorage.getItem('weather_shown_date') || '';
        const showWeather = weatherShownDate !== today;
        if (!showWeather && localStorage.getItem("greeting_shown_date") === today) return;
        localStorage.setItem("greeting_shown_date", today);

        // 尝试获取城市
        let city = 'Changsha';
        try {
          const geoRes = await fetch('https://ipapi.co/json/');
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.city) city = geoData.city;
          }
        } catch {}

        const r = await authedFetch(`${API}/api/greeting`, {
          method: 'POST',
          body: JSON.stringify({ last_visit: lastVisit || null, city, show_weather: showWeather, session_id: sessionId }),
        });
        if (r.ok) {
          const data = await r.json();
          if (data.greeting) {
            setGreetingMsg({
              id: 'greeting-' + Date.now(),
              role: 'assistant',
              content: data.greeting,
              created_at: new Date().toISOString(),
            });
          }
          if (showWeather) {
            localStorage.setItem('weather_shown_date', today);
          }
        }
      } catch (err) { console.error(err); }
      localStorage.setItem('last_visit', new Date().toISOString());
    }
    fetchGreeting();
  }, [authed]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages, greetingMsg]);

  useEffect(() => {
    localStorage.setItem('session_names', JSON.stringify(sessionNames));
  }, [sessionNames]);

  async function loadSessions() {
    try {
      const r = await authedFetch(`${API}/api/sessions`);
      if (r.status === 401) { setAuthed(false); return; }
      const data = await r.json();
      setSessions(data);
    } catch (err) { console.error(err); }
  }

  function toggleSidebar() {
    if (!showSidebar) loadSessions();
    setShowSidebar(!showSidebar);
    setSearchResults(null);
    setSearchQuery('');
    setShowStarred(false);
    setDateFilter('');
    setShowDatePicker(false);
  }

  function switchSession(id) {
    setSessionId(id);
    setShowSidebar(false);
    setExpanded({});
    setEditingId(null);
    setSearchResults(null);
    setSearchQuery('');
    setShowStarred(false);
    setDateFilter('');
  }

  function startNewChat() {
    const id = newId();
    setSessionId(id);
    setMessages([]);
    setExpanded({});
    setShowSidebar(false);
    setEditingId(null);
    setSearchResults(null);
    setShowStarred(false);
    setDateFilter('');
  }

  function startRename(id) {
    setEditingId(id);
    setEditName(sessionNames[id] || '');
  }

  function saveRename(id) {
    if (editName.trim()) {
      setSessionNames(n => ({ ...n, [id]: editName.trim() }));
    }
    setEditingId(null);
  }

  async function deleteSession(id) {
    if (!confirm('确定删除这个对话吗？删了就没了')) return;
    try {
      const r = await authedFetch(`${API}/api/messages?session_id=${id}`);
      const msgs = await r.json();
      if (Array.isArray(msgs)) {
        for (const m of msgs) {
          await authedFetch(`${API}/api/messages/${m.id}`, { method: 'DELETE' });
        }
      }
    } catch (err) { console.error(err); }
    setSessionNames(n => { const copy = { ...n }; delete copy[id]; return copy; });
    setSessions(s => s.filter(x => x.session_id !== id));
    if (sessionId === id) startNewChat();
  }

  async function doSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const r = await authedFetch(`${API}/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await r.json();
      setSearchResults(data);
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  }

  // 发消息
  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const tempUserMsg = { id: 'temp-' + Date.now(), role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, tempUserMsg]);
    setInput('');
    setLoading(true);
    try {
      const body = { session_id: sessionId, content: text };
      if (selectedModel) body.model = selectedModel;
      const r = await authedFetch(`${API}/api/chat`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r.status === 401) { setAuthed(false); return; }
      const result = await r.json();
      if (result.error) throw new Error(result.error);
      setMessages((m) => [
        ...m.filter((x) => x.id !== tempUserMsg.id),
        result.user_message,
        result.assistant_message,
      ]);
    } catch (err) {
      console.error(err);
      setMessages((m) => [
        ...m,
        { id: 'err-' + Date.now(), role: 'error', content: err.message, created_at: new Date().toISOString() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleThinking(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

  function formatTime(t) {
    try {
      const d = new Date(t);
      return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return t; }
  }

  function displayName(id) {
    if (sessionNames[id]) return sessionNames[id];
    if (id === 'default') return '默认对话';
    return id;
  }

  // 收藏/取消收藏
  function toggleStar(msgId) {
    setStarred(prev => {
      if (prev.includes(msgId)) return prev.filter(id => id !== msgId);
      return [...prev, msgId];
    });
  }

  // 导出聊天记录
  function exportChat() {
    if (messages.length === 0) return;
    const name = sessionNames[sessionId] || sessionId;
    let text = `聊天记录：${name}\n导出时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n${'─'.repeat(30)}\n\n`;
    for (const m of messages) {
      if (m.role === 'error') continue;
      const time = m.created_at ? new Date(m.created_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '';
      const who = m.role === 'user' ? '佳佳' : '小克';
      text += `[${time}] ${who}：${m.content}\n\n`;
    }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}_${new Date().toLocaleDateString('zh-CN')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 按日期筛选消息
  const filteredMessages = dateFilter
    ? messages.filter(m => {
        if (!m.created_at) return false;
        const d = new Date(m.created_at).toLocaleDateString('en-CA'); // YYYY-MM-DD
        return d === dateFilter;
      })
    : messages;

  // 收藏的消息
  const starredMessages = messages.filter(m => starred.includes(m.id));

  // 当前显示的模型名
  const currentModelLabel = selectedModel
    ? (MODEL_OPTIONS.find(m => m.value === selectedModel)?.label || selectedModel.split('/').pop())
    : '默认';

  // ===== 密码登录页 =====
  if (!authed) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
      }}>
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: 'url(/bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.5,
          zIndex: 0,
        }} />
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(135deg, rgba(245,240,255,0.55), rgba(240,248,255,0.55))',
          zIndex: 1,
        }} />

        <div style={{
          position: 'relative', zIndex: 2,
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(16px)',
          borderRadius: 20,
          padding: '40px 32px',
          width: 280,
          textAlign: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '1px solid rgba(255,255,255,0.4)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#7b6a8a', marginBottom: 24 }}>小克的家</div>
          <input
            type="password"
            value={pwdInput}
            onChange={e => setPwdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkPassword()}
            placeholder="输入密码"
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 14,
              border: '1px solid rgba(200,190,220,0.4)',
              background: 'rgba(255,255,255,0.6)',
              fontSize: 16,
              outline: 'none',
              textAlign: 'center',
              color: '#3a3a3a',
              boxSizing: 'border-box',
            }}
          />
          {pwdError && (
            <div style={{ color: '#d4616b', fontSize: 13, marginTop: 8 }}>{pwdError}</div>
          )}
          <div
            onClick={checkPassword}
            style={{
              marginTop: 16,
              padding: '10px 0',
              borderRadius: 14,
              background: 'rgba(160,140,200,0.6)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >进入</div>
        </div>
      </div>
    );
  }

  // ===== 主界面 =====
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      position: 'relative',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'url(/bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.5,
        zIndex: 0,
      }} />

      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(135deg, rgba(245,240,255,0.55), rgba(240,248,255,0.55))',
        zIndex: 1,
      }} />

      {showSidebar && (
        <div
          onClick={() => { setShowSidebar(false); setEditingId(null); setSearchResults(null); setShowStarred(false); setDateFilter(''); setShowDatePicker(false); }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        />
      )}

      {/* 侧边栏 */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: showSidebar ? 0 : -300,
        width: 290,
        height: '100%',
        background: 'rgba(250,248,255,0.95)',
        backdropFilter: 'blur(16px)',
        zIndex: 11,
        transition: 'left 0.25s ease',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(200,190,220,0.3)',
      }}>
        <div style={{
          padding: '16px',
          borderBottom: '1px solid rgba(200,190,220,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#7b6a8a' }}>历史对话</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <div
              onClick={exportChat}
              style={{
                padding: '4px 8px',
                borderRadius: 12,
                background: 'rgba(140,160,200,0.5)',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
              title="导出当前对话"
            >导出</div>
            <div
              onClick={startNewChat}
              style={{
                padding: '4px 12px',
                borderRadius: 12,
                background: 'rgba(160,140,200,0.6)',
                color: '#fff',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >+ 新对话</div>
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(200,190,220,0.15)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="搜索聊天记录..."
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 10,
                border: '1px solid rgba(200,190,220,0.3)',
                fontSize: 16, outline: 'none',
                background: 'rgba(255,255,255,0.7)',
              }}
            />
            <div
              onClick={doSearch}
              style={{
                padding: '6px 10px', borderRadius: 10,
                background: 'rgba(160,140,200,0.5)',
                color: '#fff', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center',
              }}
            >搜</div>
          </div>
          {/* 工具按钮行 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <div
              onClick={() => { setShowStarred(!showStarred); setSearchResults(null); setDateFilter(''); setShowDatePicker(false); }}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center',
                background: showStarred ? 'rgba(255,200,50,0.3)' : 'rgba(200,190,220,0.2)',
                color: '#7b6a8a', fontSize: 12, cursor: 'pointer',
              }}
            >⭐ 收藏</div>
            <div
              onClick={() => { setShowDatePicker(!showDatePicker); setShowStarred(false); setSearchResults(null); }}
              style={{
                flex: 1, padding: '5px 0', borderRadius: 8, textAlign: 'center',
                background: showDatePicker ? 'rgba(160,200,140,0.3)' : 'rgba(200,190,220,0.2)',
                color: '#7b6a8a', fontSize: 12, cursor: 'pointer',
              }}
            >📅 按日期</div>
          </div>
          {showDatePicker && (
            <div style={{ marginTop: 6 }}>
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: 10,
                  border: '1px solid rgba(200,190,220,0.3)',
                  fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.7)',
                  boxSizing: 'border-box',
                }}
              />
              {dateFilter && (
                <div
                  onClick={() => { setDateFilter(''); setShowDatePicker(false); }}
                  style={{ fontSize: 12, color: '#9a8ab5', marginTop: 4, cursor: 'pointer', textAlign: 'center' }}
                >清除日期筛选</div>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {/* 收藏消息列表 */}
          {showStarred ? (
            <div>
              <div style={{ padding: '8px 16px', fontSize: 12, color: '#a898b8' }}>
                收藏了 {starredMessages.length} 条消息
              </div>
              {starredMessages.length === 0 && (
                <div style={{ padding: 16, color: '#a898b8', fontSize: 13, textAlign: 'center' }}>
                  还没有收藏的消息，长按消息气泡可以收藏
                </div>
              )}
              {starredMessages.map(m => (
                <div
                  key={m.id}
                  style={{
                    padding: '8px 16px', borderBottom: '1px solid rgba(200,190,220,0.1)',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#a898b8', marginBottom: 2 }}>
                    {m.role === 'user' ? '佳佳' : '小克'} · {formatMsgTime(m.created_at)}
                  </div>
                  <div style={{
                    fontSize: 13, color: '#3a3a3a',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                  }}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          ) : searchResults !== null ? (
            <div>
              <div style={{
                padding: '8px 16px', fontSize: 12, color: '#a898b8',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>找到 {searchResults.length} 条结果</span>
                <span
                  onClick={() => { setSearchResults(null); setSearchQuery(''); }}
                  style={{ cursor: 'pointer', color: '#9a8ab5' }}
                >清除</span>
              </div>
              {searchResults.map(r => (
                <div
                  key={r.id}
                  onClick={() => switchSession(r.session_id)}
                  style={{
                    padding: '8px 16px', cursor: 'pointer',
                    borderBottom: '1px solid rgba(200,190,220,0.1)',
                  }}
                >
                  <div style={{ fontSize: 12, color: '#a898b8', marginBottom: 2 }}>
                    {displayName(r.session_id)} · {formatTime(r.created_at)}
                  </div>
                  <div style={{
                    fontSize: 13, color: r.role === 'user' ? '#5b4a6a' : '#3a3a3a',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {r.role === 'user' ? '你：' : '小克：'}{r.content}
                  </div>
                </div>
              ))}
              {searchResults.length === 0 && (
                <div style={{ padding: 16, color: '#a898b8', fontSize: 13, textAlign: 'center' }}>
                  没找到相关内容
                </div>
              )}
            </div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.session_id}
                style={{
                  padding: '10px 16px',
                  background: s.session_id === sessionId ? 'rgba(180,165,215,0.2)' : 'transparent',
                  borderLeft: s.session_id === sessionId ? '3px solid rgba(160,140,200,0.7)' : '3px solid transparent',
                }}
              >
                {editingId === s.session_id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveRename(s.session_id)}
                      style={{
                        flex: 1, padding: '4px 8px', borderRadius: 8,
                        border: '1px solid rgba(200,190,220,0.4)',
                        fontSize: 16, outline: 'none',
                      }}
                      autoFocus
                    />
                    <div
                      onClick={() => saveRename(s.session_id)}
                      style={{ cursor: 'pointer', fontSize: 13, color: '#7b6a8a', padding: '4px' }}
                    >✓</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      onClick={() => switchSession(s.session_id)}
                      style={{ flex: 1, cursor: 'pointer' }}
                    >
                      <div style={{
                        fontSize: 14, color: '#5b4a6a',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {displayName(s.session_id)}
                      </div>
                      <div style={{ fontSize: 11, color: '#a898b8', marginTop: 2 }}>
                        {formatTime(s.last_at)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                      <div
                        onClick={() => startRename(s.session_id)}
                        style={{ cursor: 'pointer', fontSize: 14, color: '#a898b8' }}
                        title="改名"
                      >✏</div>
                      <div
                        onClick={() => deleteSession(s.session_id)}
                        style={{ cursor: 'pointer', fontSize: 14, color: '#d4a0a0' }}
                        title="删除"
                      >✕</div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          {!searchResults && !showStarred && sessions.length === 0 && (
            <div style={{ padding: 16, color: '#a898b8', fontSize: 13, textAlign: 'center' }}>
              还没有对话记录
            </div>
          )}
        </div>
      </div>

      {/* 顶部栏 */}
      <div style={{
        padding: '14px 20px',
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(200,190,220,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        zIndex: 2,
      }}>
        <div
          onClick={toggleSidebar}
          style={{
            position: 'absolute',
            left: 16,
            fontSize: 18,
            cursor: 'pointer',
            color: '#9a8ab5',
            userSelect: 'none',
          }}
        >☰</div>
        <div
          onClick={startNewChat}
          style={{
            position: 'absolute',
            right: 16,
            fontSize: 20,
            cursor: 'pointer',
            color: '#9a8ab5',
            userSelect: 'none',
          }}
          title="新对话"
        >+</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#7b6a8a',
            letterSpacing: 1,
          }}>小克</div>
          {/* 模型选择器 */}
          <div
            onClick={() => setShowModelPicker(!showModelPicker)}
            style={{
              fontSize: 11,
              color: '#a898b8',
              cursor: 'pointer',
              marginTop: 2,
            }}
          >{currentModelLabel} ▾</div>
        </div>
      </div>

      {/* 模型选择弹窗 */}
      {showModelPicker && (
        <div style={{
          position: 'absolute',
          top: 60,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(16px)',
          borderRadius: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          border: '1px solid rgba(200,190,220,0.3)',
          zIndex: 20,
          overflow: 'hidden',
          minWidth: 180,
        }}>
          <div
            onClick={() => { setSelectedModel(''); setShowModelPicker(false); }}
            style={{
              padding: '10px 16px',
              fontSize: 14,
              color: !selectedModel ? '#7b6a8a' : '#5b4a6a',
              background: !selectedModel ? 'rgba(180,165,215,0.15)' : 'transparent',
              cursor: 'pointer',
            }}
          >默认 (Sonnet 4.6)</div>
          {MODEL_OPTIONS.map(m => (
            <div
              key={m.value}
              onClick={() => { setSelectedModel(m.value); setShowModelPicker(false); }}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                color: selectedModel === m.value ? '#7b6a8a' : '#5b4a6a',
                background: selectedModel === m.value ? 'rgba(180,165,215,0.15)' : 'transparent',
                cursor: 'pointer',
                borderTop: '1px solid rgba(200,190,220,0.1)',
              }}
            >{m.label}</div>
          ))}
        </div>
      )}

      {/* 日期筛选提示 */}
      {dateFilter && (
        <div style={{
          padding: '6px 16px',
          background: 'rgba(160,200,140,0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'relative',
          zIndex: 2,
        }}>
          <span style={{ fontSize: 12, color: '#5a7a4a' }}>
            📅 查看 {new Date(dateFilter + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} 的消息（{filteredMessages.length} 条）
          </span>
          <span
            onClick={() => setDateFilter('')}
            style={{ fontSize: 12, color: '#9a8ab5', cursor: 'pointer' }}
          >清除</span>
        </div>
      )}

      {/* 消息列表 */}
      <div ref={listRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 12px',
        position: 'relative',
        zIndex: 2,
      }}>
        {/* 问候消息放在最前面 */}
        {greetingMsg && !dateFilter && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}>
            <div style={{
              maxWidth: '72%',
              padding: '10px 14px',
              borderRadius: '18px 18px 18px 4px',
              background: 'rgba(255,255,255,0.25)',
              backdropFilter: 'blur(10px)',
              color: '#3a3a3a',
              fontSize: 15,
              lineHeight: 1.6,
              textAlign: 'left',
              boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{greetingMsg.content}</div>
            </div>
            <div style={{ fontSize: 11, color: '#b8a8c8', marginTop: 3, paddingLeft: 4 }}>
              {formatMsgTime(greetingMsg.created_at)}
            </div>
          </div>
        )}

        {filteredMessages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}
          >
            <div
              onClick={() => toggleStar(m.id)}
              style={{
                maxWidth: '72%',
                padding: '10px 14px',
                borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: m.role === 'user'
                  ? 'rgba(180,165,215,0.25)'
                  : m.role === 'error'
                  ? 'rgba(255,180,180,0.5)'
                  : 'rgba(255,255,255,0.25)',
                backdropFilter: 'blur(10px)',
                color: m.role === 'user' ? '#4a3a5a' : '#3a3a3a',
                fontSize: 15,
                lineHeight: 1.6,
                textAlign: 'left',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                border: starred.includes(m.id) ? '1px solid rgba(255,200,50,0.5)' : '1px solid rgba(255,255,255,0.3)',
                position: 'relative',
                cursor: 'pointer',
              }}>
              {starred.includes(m.id) && (
                <div style={{ position: 'absolute', top: 4, right: 8, fontSize: 10 }}>⭐</div>
              )}
              {m.thinking && (
                <div
                  onClick={(e) => { e.stopPropagation(); toggleThinking(m.id); }}
                  style={{
                    fontSize: 12,
                    color: '#a898b8',
                    cursor: 'pointer',
                    marginBottom: 4,
                    userSelect: 'none',
                  }}
                >
                  {expanded[m.id] ? '▼ 收起思考' : '▶ 查看思考'}
                </div>
              )}
              {expanded[m.id] && m.thinking && (
                <div style={{
                  fontSize: 13,
                  color: '#8a7a9a',
                  whiteSpace: 'pre-wrap',
                  marginBottom: 8,
                  padding: '8px 10px',
                  background: 'rgba(240,235,250,0.4)',
                  borderRadius: 10,
                  borderLeft: '3px solid rgba(180,160,220,0.4)',
                }}>
                  {m.thinking}
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
            {/* 时间戳 */}
            {m.created_at && (
              <div style={{
                fontSize: 11,
                color: '#b8a8c8',
                marginTop: 3,
                paddingLeft: m.role === 'user' ? 0 : 4,
                paddingRight: m.role === 'user' ? 4 : 0,
              }}>
                {formatMsgTime(m.created_at)}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-start',
            marginBottom: 10,
          }}>
            <div style={{
              padding: '10px 18px',
              borderRadius: '18px 18px 18px 4px',
              background: 'rgba(255,255,255,0.25)',
              backdropFilter: 'blur(10px)',
              color: '#a898b8',
              fontSize: 14,
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              小克在想...
            </div>
          </div>
        )}
      </div>

      {/* 输入栏 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 12px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: 'rgba(255,255,255,0.5)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(200,190,220,0.2)',
        gap: 8,
        position: 'relative',
        zIndex: 2,
      }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="跟小克说点什么..."
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 20,
            border: '1px solid rgba(200,190,220,0.3)',
            background: 'rgba(255,255,255,0.5)',
            fontSize: 16,
            outline: 'none',
            color: '#3a3a3a',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: 20,
            border: 'none',
            background: loading || !input.trim() ? 'rgba(200,190,220,0.3)' : 'rgba(160,140,200,0.6)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 500,
            cursor: loading || !input.trim() ? 'default' : 'pointer',
          }}
        >
          发送
        </button>
      </div>

      {/* 点击其他地方关闭模型选择器 */}
      {showModelPicker && (
        <div
          onClick={() => setShowModelPicker(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15 }}
        />
      )}
    </div>
  );
}
