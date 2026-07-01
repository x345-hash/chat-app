import { useEffect, useState, useRef } from 'react';
import { getMessages, chat } from './lib/api';

function newId() {
  return 'chat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function App() {
  const [sessionId, setSessionId] = useState(() => {
    return localStorage.getItem('current_session') || newId();
  });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const listRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('current_session', sessionId);
    getMessages(sessionId).then(setMessages).catch(console.error);
  }, [sessionId]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  function startNewChat() {
    const id = newId();
    setSessionId(id);
    setMessages([]);
    setExpanded({});
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const tempUserMsg = { id: 'temp-' + Date.now(), role: 'user', content: text };
    setMessages((m) => [...m, tempUserMsg]);
    setInput('');
    setLoading(true);
    try {
      const result = await chat({ session_id: sessionId, content: text });
      setMessages((m) => [
        ...m.filter((x) => x.id !== tempUserMsg.id),
        result.user_message,
        result.assistant_message,
      ]);
    } catch (err) {
      console.error(err);
      setMessages((m) => [
        ...m,
        { id: 'err-' + Date.now(), role: 'error', content: err.message },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function toggleThinking(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
  }

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
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'url(/bg.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: 0.5,
        zIndex: 0,
      }} />

      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, rgba(245,240,255,0.55), rgba(240,248,255,0.55))',
        zIndex: 1,
      }} />

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
          onClick={startNewChat}
          style={{
            position: 'absolute',
            left: 16,
            fontSize: 20,
            cursor: 'pointer',
            color: '#9a8ab5',
            userSelect: 'none',
          }}
          title="新对话"
        >+</div>
        <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: '#7b6a8a',
          letterSpacing: 1,
        }}>小克</div>
      </div>

      <div ref={listRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px 12px',
        position: 'relative',
        zIndex: 2,
      }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 10,
            }}
          >
            <div style={{
              maxWidth: '75%',
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
              boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
              border: '1px solid rgba(255,255,255,0.3)',
            }}>
              {m.thinking && (
                <div
                  onClick={() => toggleThinking(m.id)}
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
            fontSize: 15,
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
    </div>
  );
}
