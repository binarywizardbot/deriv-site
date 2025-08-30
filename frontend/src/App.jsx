import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { login, logout, streamTicks, derivCall, getPortfolio, getStatement } from './lib/api';

const SYMBOLS = [
  { code: 'R_10', label: 'Volatility 10 Index' },
  { code: 'R_25', label: 'Volatility 25 Index' },
  { code: 'R_50', label: 'Volatility 50 Index' },
  { code: 'R_75', label: 'Volatility 75 Index' },
  { code: 'R_100', label: 'Volatility 100 Index' },
];

export default function App() {
  const [token, setToken] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [symbol, setSymbol] = useState(SYMBOLS[2].code);
  const [ticks, setTicks] = useState([]);
  const [amount, setAmount] = useState(10);
  const [duration, setDuration] = useState(5);
  const [portfolio, setPortfolio] = useState([]);
  const [history, setHistory] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loggedIn) return;
    setTicks([]);
    const stop = streamTicks(symbol, (t) => {
      setTicks((prev) => [...prev.slice(-120), { time: t.epoch * 1000, quote: t.quote }]);
    });
    return stop;
  }, [symbol, loggedIn]);

  const chartData = useMemo(() => ticks.map(t => ({ time: new Date(t.time).toLocaleTimeString(), price: t.quote })), [ticks]);

  async function handleLogin(e) {
    e.preventDefault();
    try {
      await login(token.trim());
      setLoggedIn(true);
      refresh();
    } catch (err) { setError(err.message); }
  }

  async function refresh() {
    try {
      const p = await getPortfolio();
      setPortfolio(p.portfolio?.contracts || []);
      const s = await getStatement({ limit: 50 });
      setHistory(s.statement?.transactions || []);
    } catch (err) { console.error(err); }
  }

  async function placeCallPut(type) {
    // Simple example: 5-tick CALL/PUT proposal then buy
    setPlacing(true); setError('');
    try {
      const proposal = await derivCall({
        proposal: 1,
        amount: Number(amount),
        basis: 'stake',
        contract_type: type, // 'CALL' or 'PUT'
        currency: 'USD',
        duration: Number(duration),
        duration_unit: 't',
        symbol,
      });
      const { id: proposal_id, ask_price } = proposal.proposal;
      const buy = await derivCall({ buy: proposal_id, price: ask_price });
      await refresh();
      alert(`Trade placed. Contract ID: ${buy.buy?.contract_id}`);
    } catch (err) { setError(err.message || 'Trade failed'); }
    finally { setPlacing(false); }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Deriv Trading Dashboard</h1>
        <div className="flex items-center gap-2">
          {loggedIn ? (
            <button onClick={async ()=>{ await logout(); setLoggedIn(false);} } className="px-3 py-2 rounded-xl bg-slate-900 text-white">Logout</button>
          ) : null}
        </div>
      </header>

      {!loggedIn ? (
        <form onSubmit={handleLogin} className="max-w-xl mx-auto bg-white p-4 md:p-6 rounded-2xl shadow">
          <h2 className="text-lg font-medium mb-2">Authenticate with Deriv API Token</h2>
          <p className="text-sm text-slate-600 mb-4">Your token is stored server‑side in an httpOnly cookie. You can create a token in your Deriv account with the scopes you need (read, trade).</p>
          <input value={token} onChange={(e)=>setToken(e.target.value)} required type="password" placeholder="Enter Deriv API token" className="w-full border rounded-xl p-3 mb-3" />
          <button className="w-full py-3 rounded-xl bg-blue-600 text-white">Sign In</button>
          {error && <p className="text-red-600 mt-3">{error}</p>}
        </form>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <select className="border rounded-xl p-2" value={symbol} onChange={e=>setSymbol(e.target.value)}>
                {SYMBOLS.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
              <button onClick={refresh} className="px-3 py-2 rounded-xl bg-slate-900 text-white">Refresh</button>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" className="border rounded-xl p-2 w-24" value={amount} onChange={(e)=>setAmount(e.target.value)} />
              <span className="text-sm text-slate-500">USD, Amount</span>
              <input type="number" className="border rounded-xl p-2 w-24" value={duration} onChange={(e)=>setDuration(e.target.value)} />
              <span className="text-sm text-slate-500">Ticks</span>
              <button disabled={placing} onClick={()=>placeCallPut('CALL')} className="px-3 py-2 rounded-xl bg-green-600 text-white disabled:opacity-50">Buy CALL</button>
              <button disabled={placing} onClick={()=>placeCallPut('PUT')} className="px-3 py-2 rounded-xl bg-red-600 text-white disabled:opacity-50">Buy PUT</button>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <XAxis dataKey="time" hide={false} minTickGap={24} />
                <YAxis domain={['auto','auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="price" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: positions */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="font-medium mb-2">Open Positions</h3>
          <div className="overflow-auto max-h-96">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">ID</th>
                  <th className="py-2">Symbol</th>
                  <th className="py-2">Entry</th>
                  <th className="py-2">P/L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.length === 0 && (
                  <tr><td colSpan="4" className="py-3 text-slate-500">No open positions</td></tr>
                )}
                {portfolio.map(c => (
                  <tr key={c.contract_id} className="border-t">
                    <td className="py-2">{c.contract_id}</td>
                    <td className="py-2">{c.underlying}</td>
                    <td className="py-2">{c.buy_price}</td>
                    <td className="py-2">{c.profit || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Full width: History */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow p-4">
          <h3 className="font-medium mb-2">Transaction History</h3>
          <div className="overflow-auto max-h-96">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2">Time</th>
                  <th className="py-2">Action</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Balance</th>
                  <th className="py-2">Symbol</th>
                </tr>
              </thead>
              <tbody>
                {history.map((tx, i) => (
                  <tr className="border-t" key={i}>
                    <td className="py-2">{new Date(tx.transaction_time * 1000).toLocaleString()}</td>
                    <td className="py-2">{tx.action_type}</td>
                    <td className="py-2">{tx.amount}</td>
                    <td className="py-2">{tx.balance_after}</td>
                    <td className="py-2">{tx.symbol || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
