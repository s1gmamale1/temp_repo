import { useState, useEffect, useCallback, useMemo } from 'react';
import { tokensApi } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Loader2, RefreshCw, TrendingUp, Wallet, Coins, Activity, AlertTriangle } from 'lucide-react';

interface ProviderData { name: string; budget: number; used: number; tokens: number; }
interface DashboardData { totalBudget: number; totalUsed: number; totalRemaining: number; totalTokens: number; providers: ProviderData[]; }
interface UsagePoint { date: string; tokens: number; cost: number; requests: number; }
interface ModelData { name: string; provider: string; tokens: number; cost: number; }

const PROVIDER_CFG: Record<string, { color: string; label: string }> = {
  kimi: { color: '#4287f5', label: 'KIMI' },
  openai: { color: '#10a37f', label: 'OPENAI' },
  claude: { color: '#faa81a', label: 'CLAUDE' },
};

type Period = '7d' | '30d' | '90d' | '3m' | '6m';
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90, '3m': 90, '6m': 180 };

const fmt$ = (n: number) => '$' + n.toFixed(2);
const fmtT = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

export default function Costs() {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [usage, setUsage] = useState<UsagePoint[]>([]);
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('all');
  const [period, setPeriod] = useState<Period>('30d');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const days = PERIOD_DAYS[period];
      const dashboard = await tokensApi.getDashboard();
      setDash(dashboard);

      const extractDaily = (r: any): UsagePoint[] =>
        Array.isArray(r) ? r : (r?.daily ?? r?.data ?? []);

      if (tab === 'all') {
        const [kd, od, cd] = await Promise.all([
          tokensApi.getUsageByProvider('kimi', { days }),
          tokensApi.getUsageByProvider('openai', { days }),
          tokensApi.getUsageByProvider('claude', { days }),
        ]);
        const merged = new Map<string, UsagePoint>();
        for (const day of [...extractDaily(kd), ...extractDaily(od), ...extractDaily(cd)]) {
          const e = merged.get(day.date);
          if (e) { e.tokens += day.tokens || 0; e.cost += day.cost || 0; e.requests += day.requests || 0; }
          else merged.set(day.date, { date: day.date, tokens: day.tokens || 0, cost: day.cost || 0, requests: day.requests || 0 });
        }
        setUsage(Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date)));
      } else {
        const r = await tokensApi.getUsageByProvider(tab, { days });
        setUsage(extractDaily(r));
      }

      try {
        const md = await tokensApi.getAllModels();
        setModels(md.models || []);
      } catch {
        const ms: ModelData[] = [];
        for (const p of dashboard.providers) {
          try {
            const pd = await tokensApi.getProvider(p.name);
            ms.push(...(pd.models || []).map((m: any) => ({ name: m.name, provider: p.name, tokens: m.tokens || 0, cost: m.cost || 0 })));
          } catch { /* skip */ }
        }
        setModels(ms.sort((a, b) => b.cost - a.cost));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [period, tab]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const t = setInterval(fetchData, 300_000); return () => clearInterval(t); }, [fetchData]);

  const budgetPct = useMemo(() => !dash ? 0 : Math.min((dash.totalUsed / dash.totalBudget) * 100, 100), [dash]);
  const totalReqs = useMemo(() => usage.reduce((s, d) => s + (d.requests || 0), 0), [usage]);
  const shownProviders = useMemo(() => !dash ? [] : tab === 'all' ? dash.providers : dash.providers.filter(p => p.name === tab), [dash, tab]);
  const shownModels = useMemo(() => tab === 'all' ? models : models.filter(m => m.provider === tab), [models, tab]);

  if (loading && !dash) return (
    <div className="flex items-center justify-center h-64 gap-3">
      <Loader2 size={16} className="animate-spin" style={{ color: 'var(--amber)' }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', letterSpacing: '0.1em' }}>LOADING COST DATA...</span>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">

      {/* HEADER */}
      <div className="flex items-start justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Operations</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>API USAGE & COSTS</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1" style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: 3 }}>
            {(['7d', '30d', '90d', '3m', '6m'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', padding: '4px 10px', borderRadius: 1, cursor: 'pointer', transition: 'all 100ms', background: period === p ? 'var(--amber)' : 'transparent', color: period === p ? '#000' : 'var(--text-lo)', border: 'none' }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={fetchData} disabled={loading} className="ops-btn flex items-center gap-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="flex items-center gap-3 p-3" style={{ background: 'var(--ink-2)', border: '1px solid #7f1d1d', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171' }}>
          <AlertTriangle size={13} /> ERR: {error}
          <button onClick={fetchData} style={{ marginLeft: 'auto', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' }}>retry</button>
        </div>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'TOTAL TOKENS', val: dash ? fmtT(dash.totalTokens) : '—', icon: <Coins size={13} />, color: 'var(--amber)' },
          { label: 'TOTAL SPENT', val: dash ? fmt$(dash.totalUsed) : '—', icon: <TrendingUp size={13} />, color: 'var(--text-hi)' },
          { label: 'PROVIDERS', val: dash ? String(dash.providers?.filter((p: any) => p.used > 0).length || 0) + ' active' : '—', icon: <Wallet size={13} />, color: '#10b981' },
          { label: 'REQUESTS', val: fmtT(totalReqs), icon: <Activity size={13} />, color: '#60a5fa' },
        ].map(s => (
          <div key={s.label} className="ops-stat">
            <div className="flex items-center justify-between mb-2">
              <span className="ops-label">{s.label}</span>
              <span style={{ color: 'var(--text-lo)' }}>{s.icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* BUDGET BAR - only show when there's actual spend */}
      {dash && dash.totalUsed > 0 && (
        <div className="ops-panel p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="ops-section-header" style={{ marginBottom: 0 }}>Budget Utilization</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: budgetPct > 80 ? '#ef4444' : 'var(--amber)' }}>
              {budgetPct.toFixed(1)}%{budgetPct > 80 ? ' ⚠ HIGH' : ''}
            </span>
          </div>
          <div className="ops-bar-track" style={{ height: 6 }}>
            <div style={{ height: '100%', width: budgetPct + '%', background: budgetPct > 80 ? 'linear-gradient(90deg,#b91c1c,#ef4444)' : 'linear-gradient(90deg,var(--amber-dark),var(--amber))', transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)', borderRadius: 1 }} />
          </div>
          <div className="flex justify-between mt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
            <span>$0</span><span>{fmt$(dash.totalUsed)} spent</span>
          </div>
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--ink-4)' }}>
        {['all', 'kimi', 'openai', 'claude'].map(t => {
          const cfg = PROVIDER_CFG[t];
          const pd = dash?.providers.find(p => p.name === t);
          return (
            <button key={t} onClick={() => setTab(t)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '7px 16px', border: '1px solid transparent', borderBottom: 'none', borderRadius: '2px 2px 0 0', cursor: 'pointer', marginBottom: -1, transition: 'all 100ms', background: tab === t ? 'var(--ink-2)' : 'transparent', color: tab === t ? (cfg?.color || 'var(--amber)') : 'var(--text-lo)', borderColor: tab === t ? 'var(--ink-4)' : 'transparent', borderBottomColor: tab === t ? 'var(--ink-2)' : 'transparent' }}>
              {t === 'all' ? 'ALL' : t.toUpperCase()}
              {pd && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-lo)' }}>{fmt$(pd.used)}</span>}
            </button>
          );
        })}
      </div>

      {/* USAGE CHART */}
      <div className="ops-panel p-5">
        <div className="ops-section-header mb-4">Token Usage — {period.toUpperCase()}</div>
        {usage.length === 0 ? (
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>— no usage recorded for this period —</p>
          </div>
        ) : (
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usage} barSize={6} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-4)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-lo)' }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-lo)' }} tickFormatter={fmtT} width={36} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: any) => [fmtT(Number(v)), 'Tokens']} labelStyle={{ color: 'var(--text-mid)' }} />
                <Bar dataKey="tokens" fill="var(--amber)" opacity={0.75} radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* PROVIDER + COST CHART */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="ops-panel p-5">
          <div className="ops-section-header mb-4">Provider Breakdown</div>
          {shownProviders.filter(p => p.used > 0).length === 0 ? (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', padding: '24px 0', textAlign: 'center' }}>— no spend recorded —</p>
          ) : (
            <table className="ops-table w-full">
              <thead><tr><th>Provider</th><th style={{ textAlign: 'right' }}>Tokens</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Req</th></tr></thead>
              <tbody>
                {shownProviders.filter(p => p.used > 0).map(p => {
                  const cfg = PROVIDER_CFG[p.name] || { color: 'var(--text-lo)', label: p.name };
                  return (
                    <tr key={p.name}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ color: cfg.color }}>{cfg.label}</span>
                      </div></td>
                      <td style={{ textAlign: 'right' }}>{fmtT(p.tokens)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{fmt$(p.used)}</td>
                      <td style={{ textAlign: 'right' }}>{(p as any).requests || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="ops-panel p-5">
          <div className="ops-section-header mb-4">Cost Over Time</div>
          {usage.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>— no data —</p>
            </div>
          ) : (
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={usage} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-4)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-lo)' }} tickFormatter={d => d.slice(5)} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--text-lo)' }} tickFormatter={v => '$' + Number(v).toFixed(2)} width={42} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, fontFamily: 'var(--font-mono)', fontSize: 11 }} formatter={(v: any) => [fmt$(Number(v)), 'Cost']} labelStyle={{ color: 'var(--text-mid)' }} />
                  <Line type="monotone" dataKey="cost" stroke="var(--amber)" strokeWidth={1.5} dot={false} activeDot={{ r: 4, fill: 'var(--amber)', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* MODEL BREAKDOWN */}
      <div className="ops-panel p-5">
        <div className="ops-section-header mb-4">Model Breakdown</div>
        {shownModels.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', padding: '24px 0', textAlign: 'center' }}>— no model data for this period —</p>
        ) : (
          <table className="ops-table w-full">
            <thead><tr><th>Model</th><th>Provider</th><th style={{ textAlign: 'right' }}>Tokens</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Share</th></tr></thead>
            <tbody>
              {shownModels.slice(0, 10).map(m => {
                const cfg = PROVIDER_CFG[m.provider] || { color: 'var(--text-lo)', label: m.provider };
                const pct = shownModels[0]?.cost ? (m.cost / shownModels[0].cost) * 100 : 0;
                return (
                  <tr key={m.name + m.provider}>
                    <td style={{ maxWidth: 160 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.name}>{m.name}</span></td>
                    <td><span style={{ color: cfg.color, fontSize: 10 }}>{cfg.label}</span></td>
                    <td style={{ textAlign: 'right' }}>{fmtT(m.tokens)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt$(m.cost)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <div style={{ width: 48, height: 4, background: 'var(--ink-4)', borderRadius: 1, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: pct + '%', background: cfg.color, borderRadius: 1 }} />
                        </div>
                        <span style={{ fontSize: 9, minWidth: 28 }}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}