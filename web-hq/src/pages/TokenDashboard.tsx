import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2, RefreshCw, Wallet, Coins, Activity, AlertTriangle, ChevronDown, Zap } from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

async function apiFetch(path: string) {
  const token = localStorage.getItem('claw_token');
  const r = await fetch(API_BASE + path, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const fmt$ = (n: number) => '$' + Number(n || 0).toFixed(4);
const fmt$2 = (n: number) => '$' + Number(n || 0).toFixed(2);
const fmtT = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n || 0));
const fmtCNY = (n: number) => '¥' + Number(n || 0).toFixed(2);

const PROVIDER_COLOR: Record<string, string> = {
  kimi: '#4287f5', moonshot: '#4287f5',
  openai: '#10a37f', gpt: '#10a37f',
  claude: '#faa81a', anthropic: '#faa81a',
};
const provColor = (p: string) => PROVIDER_COLOR[p?.toLowerCase()] || '#64748b';

export default function TokenDashboard() {
  const [data, setData] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  });

  const months = (() => {
    const list = []; const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ value: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) });
    }
    return list;
  })();

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const mp = '?month=' + selectedMonth;
      const [live, usage] = await Promise.all([
        apiFetch('/api/tokens/live' + mp),
        apiFetch('/api/tokens/usage?provider=kimi&month=' + selectedMonth).catch(() => ({ daily: [] })),
      ]);
      setData(live);
      setDaily(usage?.daily || []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [selectedMonth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading && !data) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>LOADING TOKEN DATA...</span>
    </div>
  );

  if (error && !data) return (
    <div className="ops-panel p-8 text-center space-y-3">
      <AlertTriangle size={18} style={{ color: '#ef4444', margin: '0 auto' }} />
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444' }}>ERR: {error}</p>
      <button onClick={fetchAll} className="ops-btn">Retry</button>
    </div>
  );

  const kimi = data?.kimi;
  const totals = data?.totals || {};
  const agents = data?.agents || [];
  const providers = data?.providers || [];

  // Group agents by agentName for summary rows
  const agentSummary = Object.values(
    agents.reduce((acc: any, r: any) => {
      const k = r.agentId;
      if (!acc[k]) acc[k] = { agentId: r.agentId, agentName: r.agentName, cost: 0, tokens: 0, requests: 0, models: [] };
      acc[k].cost += r.cost;
      acc[k].tokens += r.tokens;
      acc[k].requests += r.requests;
      acc[k].models.push(r);
      return acc;
    }, {})
  ) as any[];

  return (
    <div className="space-y-5 animate-fade-up">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Operations</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>TOKEN MONITOR</h1>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ position: 'relative' }}>
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              className="ops-input" style={{ paddingRight: 28, width: 'auto', cursor: 'pointer', appearance: 'none' }}>
              {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)', pointerEvents: 'none' }} />
          </div>
          <button onClick={fetchAll} disabled={loading} className="ops-btn flex items-center gap-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* KIMI LIVE BALANCE — top card if API key configured */}
      {kimi ? (
        <div className="ops-panel p-5" style={{ borderColor: '#4287f530', background: 'linear-gradient(135deg, var(--ink-2) 0%, #4287f508 100%)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4287f5', display: 'inline-block' }} />
              <span className="ops-section-header" style={{ marginBottom: 0, color: '#4287f5' }}>KIMI / MOONSHOT — LIVE BALANCE</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>LIVE · {kimi.currency}</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Cash Balance', val: fmtCNY(kimi.cashBalance), color: '#10b981' },
              { label: 'Voucher Balance', val: fmtCNY(kimi.voucherBalance), color: '#60a5fa' },
              { label: 'Total Available', val: fmtCNY(kimi.totalBalance), color: '#faa81a' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: s.color }}>{s.val}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="ops-panel p-4" style={{ borderStyle: 'dashed' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', textAlign: 'center' }}>
            MOONSHOT_API_KEY not configured — live balance unavailable
          </p>
        </div>
      )}

      {/* THIS MONTH TOTALS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Month Spend', val: fmt$2(totals.cost), icon: <Wallet size={13} />, color: totals.cost > 0 ? 'var(--amber)' : 'var(--text-lo)' },
          { label: 'Total Tokens', val: fmtT(totals.tokens), icon: <Coins size={13} />, color: 'var(--text-hi)' },
          { label: 'API Requests', val: String(totals.requests || 0), icon: <Activity size={13} />, color: '#60a5fa' },
          { label: 'Active Agents', val: String(totals.agents || 0), icon: <Zap size={13} />, color: '#10b981' },
        ].map(s => (
          <div key={s.label} className="ops-stat">
            <div className="flex items-center justify-between mb-2">
              <span className="ops-label">{s.label}</span>
              <span style={{ color: 'var(--text-lo)' }}>{s.icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', marginTop: 2 }}>{selectedMonth}</div>
          </div>
        ))}
      </div>

      {/* AGENT × MODEL BREAKDOWN — the main table */}
      <div className="ops-panel p-5">
        <div className="ops-section-header mb-4">Agent Usage Breakdown</div>
        {agents.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-lo)' }}>— no agent activity recorded this period —</p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', marginTop: 8, opacity: 0.6 }}>Usage is recorded when agents make API calls via storeTokenUsage()</p>
          </div>
        ) : (
          <table className="ops-table w-full">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Provider</th>
                <th>Model</th>
                <th style={{ textAlign: 'right' }}>Input</th>
                <th style={{ textAlign: 'right' }}>Output</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th style={{ textAlign: 'right' }}>Req</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((r: any, i: number) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-hi)' }}>{r.agentName}</span>
                    </div>
                  </td>
                  <td>
                    <span style={{ color: provColor(r.provider), fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {r.provider}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--text-mid)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 160 }} title={r.model}>
                      {r.model}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmtT(r.input)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtT(r.output)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-hi)' }}>{fmtT(r.tokens)}</td>
                  <td style={{ textAlign: 'right', color: r.cost > 0 ? 'var(--amber)' : 'var(--text-lo)' }}>{fmt$(r.cost)}</td>
                  <td style={{ textAlign: 'right' }}>{r.requests}</td>
                </tr>
              ))}
            </tbody>
            {agents.length > 1 && (
              <tfoot>
                <tr style={{ borderTop: '1px solid var(--ink-4)' }}>
                  <td colSpan={5} style={{ paddingTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-hi)', fontWeight: 700 }}>{fmtT(totals.tokens)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--amber)', fontWeight: 700 }}>{fmt$(totals.cost)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-hi)', fontWeight: 700 }}>{totals.requests}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* PROVIDER SUMMARY + DAILY CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Provider totals */}
        <div className="ops-panel p-5">
          <div className="ops-section-header mb-4">Provider Summary</div>
          {providers.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', padding: '24px 0', textAlign: 'center' }}>— no data —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Provider</th><th style={{ textAlign: 'right' }}>Tokens</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Req</th></tr></thead>
              <tbody>
                {providers.map((p: any) => (
                  <tr key={p.provider}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: provColor(p.provider), display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ color: provColor(p.provider), textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.06em' }}>{p.provider}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>{fmtT(p.tokens)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{fmt$(p.cost)}</td>
                    <td style={{ textAlign: 'right' }}>{p.requests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Daily spend chart (Kimi) */}
        <div className="ops-panel p-5">
          <div className="ops-section-header mb-4">Daily Spend — Kimi</div>
          {daily.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>— no data —</p>
            </div>
          ) : (
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} barSize={7} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-4)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-lo)' }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-lo)' }} tickFormatter={v => '$' + Number(v).toFixed(3)} width={48} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                    formatter={(v: any) => [fmt$(Number(v)), 'Cost']} labelStyle={{ color: 'var(--text-mid)' }} />
                  <Bar dataKey="cost" fill="#4287f5" opacity={0.85} radius={[1, 1, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}