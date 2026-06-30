const API = import.meta.env.VITE_API_BASE;

if (!API) console.error('VITE_API_BASE not set');

export async function getMessages(session_id) {
  const url = new URL(`${API}/api/messages`);
  if (session_id) url.searchParams.set('session_id', session_id);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`getMessages ${r.status}`);
  return r.json();
}

export async function chat({ session_id, content, system, model }) {
  const r = await fetch(`${API}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id, content, system, model }),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`chat ${r.status}: ${err}`);
  }
  return r.json();
}
