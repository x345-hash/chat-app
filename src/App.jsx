import { useEffect, useState, useRef } from 'react';
import { getMessages, chat } from './lib/api';

const SESSION_ID = 'default';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const listRef = useRef(null);

  useEffect(() => {
    getMessages(SESSION_ID).then(setMessages).catch(console.error);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const tempUserMsg = { id: 'temp-' + Date.now(), role: 'user', content: text };
    setMessages((m) => [...m, tempUserMsg]);
    setInput('');
    setLoading(true);
    try {
      const result = await chat({ session_id: SESSION_ID, content: text });
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                maxWidth: '70%',
                padding: 12,
                borderRadius: 12,
                background:
                  m.role === 'user'
                    ? '#cce5ff'
                    : m.role === 'error'
                    ? '#ffcccc'
                    : '#eee',
              }}
            >
              {m.thinking && (
                <button
                  onClick={() => toggleThinking(m.id)}
                  style={{ fontSize: 12, marginBottom: 4 }}
                >
                  {expanded[m.id] ? '收起' : '思考'}
                </button>
              )}
              {expanded[m.id] && m.thinking && (
                <div style={{ fontSize: 12, color: '#666', whiteSpace: 'pre-wrap', marginBottom: 8 }}>
                  {m.thinking}
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            </div>
          </div>
        ))}
        {loading && <div style={{ color: '#888' }}>AI 在思考...</div>}
      </div>
      <div style={{ display: 'flex', padding: 12, borderTop: '1px solid #ddd' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="说点什么..."
          disabled={loading}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ marginLeft: 8 }}>
          发送
        </button>
      </div>
    </div>
  );
}
