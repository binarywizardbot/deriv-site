const API = import.meta.env.VITE_API_BASE || 'http://localhost:8080';

export async function login(token) {
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token }),
  });
  if (!r.ok) throw new Error('Login failed');
  return r.json();
}

export async function logout() {
  await fetch(`${API}/api/logout`, { method: 'POST', credentials: 'include' });
}

export function streamTicks(symbol, onTick) {
  const url = new URL(`${API}/api/stream/ticks`);
  url.searchParams.set('symbol', symbol);
  const es = new EventSource(url, { withCredentials: true });
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.msg_type === 'tick') onTick(data.tick);
  };
  return () => es.close();
}

export async function derivCall(payload) {
  const r = await fetch(`${API}/api/deriv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || 'Deriv error');
  if (json.error) throw new Error(json.error.message);
  return json;
}

export async function getPortfolio() {
  return derivCall({ portfolio: 1 });
}

export async function getStatement({ limit = 20 } = {}) {
  return derivCall({ statement: 1, limit });
}
