import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Bot, Server, Wifi, WifiOff, AlertTriangle, CheckCircle, Clock, FolderKanban, ListChecks, Coins, Activity } from 'lucide-react';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

async function apiFetch(path: string) {
  const token = localStorage.getItem('claw_token');
  const r = await fetch(API_BASE + path, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

const STATUS_CFG: Record<string, { color: string; dot: string; label: string }> = {
  online:  { color: '#10b981', dot: 'ops-dot-green',  label: 'ONLINE'  },
  idle:    { color: 'var(--amber)', dot: 'ops-dot-amber', label: 'IDLE' },
  busy:    { color: '#60a5fa', dot: 'ops-dot-blue',   label: 'BUSY'    },
  offline: { color: '#64748b', dot: 'ops-dot-gray',   label: 'OFFLINE' },
  error:   { color: '#ef4444', dot: 'ops-dot-red',    label: 'ERROR'   },
};

const MACHINE_CFG: Record<string, { color: string; label: string }> = {
  active:      { color: '#10b981', label: 'ACTIVE'      },
  offline:     { color: '#64748b', label: 'OFFLINE'     },
  maintenance: { color: 'var(--amber)', label: 'MAINT.' },
};

function timeAgo(ts: string | null): string {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isOfflineAlert(lastSeen: string | null, status: string): boolean {
  if (status === 'offline') return false; // already marked offline
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() > 5 * 60 * 1000; // 5 min
}

export default function SystemHealth() {
  const [agents, setAgents] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [serviceStatus, setServiceStatus] = useState({
    backendUp: false,
    backendLatencyMs: 0,
    frontendUp: typeof navigator !== 'undefined' ? navigator.onLine : true,
    backendVersion: '—',
  });
  const [recentIssues, setRecentIssues] = useState<any[]>([]);
  const [opsSummary, setOpsSummary] = useState({
    projects: 0,
    activeTasks: 0,
    completedTasks: 0,
    totalTokens: 0,
    totalCost: 0,
    requestCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const startedAt = performance.now();
      const [healthRes, ag, mc, pr, tk, activity] = await Promise.all([
        apiFetch('/health').catch(() => null),
        apiFetch('/api/agents'),
        apiFetch('/api/machines').catch(() => ({ machines: [] })),
        apiFetch('/api/projects').catch(() => ({ projects: [] })),
        apiFetch('/api/tokens/live').catch(() => ({ totals: {} })),
        apiFetch('/api/activity?limit=40').catch(() => ({ activities: [] })),
      ]);
      const backendLatencyMs = Math.round(performance.now() - startedAt);
      const projects = Array.isArray(pr) ? pr : (pr?.projects || []);
      const activeTasks = projects.reduce((sum: number, p: any) => sum + (p?.stats?.activeTasks || 0), 0);
      const completedTasks = projects.reduce((sum: number, p: any) => sum + (p?.stats?.completedTasks || 0), 0);

      setAgents(Array.isArray(ag) ? ag : (ag?.agents || []));
      setMachines(Array.isArray(mc) ? mc : (mc?.machines || []));
      setOpsSummary({
        projects: projects.length,
        activeTasks,
        completedTasks,
        totalTokens: tk?.totals?.tokens || 0,
        totalCost: tk?.totals?.cost || 0,
        requestCount: tk?.totals?.requests || 0,
      });

      setServiceStatus({
        backendUp: Boolean(healthRes?.status === 'ok'),
        backendLatencyMs,
        frontendUp: typeof navigator !== 'undefined' ? navigator.onLine : true,
        backendVersion: healthRes?.version || '—',
      });

      const issues = (activity?.activities || [])
        .filter((a: any) => ['failed', 'error', 'rejected', 'cancelled'].some(k => String(a.action || '').toLowerCase().includes(k)))
        .slice(0, 6);
      setRecentIssues(issues);

      setLastRefresh(new Date());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(fetchAll, 30000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const statusGroups = {
    online:  agents.filter(a => a.status === 'online'),
    busy:    agents.filter(a => a.status === 'busy'),
    idle:    agents.filter(a => a.status === 'idle'),
    offline: agents.filter(a => a.status === 'offline' || a.status === 'error'),
  };
  const alerts = agents.filter(a => isOfflineAlert(a.last_seen || a.last_heartbeat, a.status));
  const machineAlerts = machines.filter(m => m.status === 'offline');

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="ops-section-header" style={{ marginBottom: 4 }}>Management</div>
          <h1 style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>SYSTEM HEALTH</h1>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.06em' }}>
              UPDATED {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchAll} disabled={loading} className="ops-btn flex items-center gap-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Alert bar */}
      {(alerts.length > 0 || machineAlerts.length > 0) && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 4, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertTriangle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444' }}>
            {[
              alerts.length > 0 && `${alerts.length} agent${alerts.length > 1 ? 's' : ''} unreachable (>5min)`,
              machineAlerts.length > 0 && `${machineAlerts.length} machine${machineAlerts.length > 1 ? 's' : ''} offline`,
            ].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Online', val: statusGroups.online.length + statusGroups.busy.length, icon: <Wifi size={13} />, color: '#10b981' },
          { label: 'Idle',   val: statusGroups.idle.length,    icon: <Clock size={13} />,  color: 'var(--amber)' },
          { label: 'Offline',val: statusGroups.offline.length, icon: <WifiOff size={13} />,color: '#64748b' },
          { label: 'Machines',val: machines.filter(m => m.status === 'active').length + '/' + machines.length, icon: <Server size={13} />, color: '#60a5fa' },
        ].map(s => (
          <div key={s.label} className="ops-stat">
            <div className="flex items-center justify-between mb-2">
              <span className="ops-label">{s.label}</span>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Ops snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Projects', val: opsSummary.projects, icon: <FolderKanban size={13} />, color: '#a78bfa' },
          { label: 'Active Tasks', val: opsSummary.activeTasks, icon: <ListChecks size={13} />, color: '#38bdf8' },
          { label: 'Completed Tasks', val: opsSummary.completedTasks, icon: <CheckCircle size={13} />, color: '#10b981' },
          { label: 'Token Usage', val: opsSummary.totalTokens.toLocaleString(), icon: <Activity size={13} />, color: 'var(--amber)' },
          { label: 'Cost (USD)', val: `$${Number(opsSummary.totalCost || 0).toFixed(4)}`, icon: <Coins size={13} />, color: '#f59e0b' },
          { label: 'Requests', val: opsSummary.requestCount, icon: <Clock size={13} />, color: '#60a5fa' },
        ].map((s) => (
          <div key={s.label} className="ops-stat">
            <div className="flex items-center justify-between mb-2">
              <span className="ops-label">{s.label}</span>
              <span style={{ color: s.color }}>{s.icon}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Service heartbeat */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="ops-panel p-4">
          <div className="ops-section-header mb-3">Service Heartbeat</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)' }}>Backend (3001)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: serviceStatus.backendUp ? '#10b981' : '#ef4444' }}>
                {serviceStatus.backendUp ? 'UP' : 'DOWN'} · {serviceStatus.backendLatencyMs}ms
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)' }}>Frontend (5173)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: serviceStatus.frontendUp ? '#10b981' : '#ef4444' }}>
                {serviceStatus.frontendUp ? 'UP' : 'OFFLINE'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)' }}>Backend Version</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hi)' }}>{serviceStatus.backendVersion}</span>
            </div>
          </div>
        </div>
        <div className="ops-panel p-4">
          <div className="ops-section-header mb-3">Recent Issues</div>
          {recentIssues.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#10b981' }}>No recent failure events 🎉</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentIssues.map((i: any) => (
                <div key={i.id} style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)', borderRadius: 4, padding: '6px 8px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ef4444', textTransform: 'uppercase' }}>{i.event_type} · {i.action}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-hi)', marginTop: 2 }}>{i.entity_title || i.project_name || i.entity_id}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading && !agents.length ? (
        <div className="flex items-center justify-center h-40 gap-3">
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--amber)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)' }}>LOADING...</span>
        </div>
      ) : error ? (
        <div className="ops-panel p-6 text-center">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#ef4444' }}>ERR: {error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Agent status grid */}
          <div className="ops-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bot size={13} style={{ color: 'var(--text-lo)' }} />
              <div className="ops-section-header">Agent Status</div>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>{agents.length} total</span>
            </div>
            {agents.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', padding: '24px 0', textAlign: 'center' }}>— no agents registered —</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {agents.map(agent => {
                  const cfg = STATUS_CFG[agent.status] || STATUS_CFG.offline;
                  const alert = isOfflineAlert(agent.last_seen || agent.last_heartbeat, agent.status);
                  const isRegisteredOnly = agent.is_active === false && ['online', 'idle', 'busy', 'working'].includes(String(agent.status || '').toLowerCase());
                  return (
                    <div key={agent.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 3,
                      background: alert ? 'rgba(239,68,68,0.04)' : 'var(--ink-2)',
                      border: `1px solid ${alert ? 'rgba(239,68,68,0.15)' : 'var(--ink-4)'}`,
                    }}>
                      <span className={`ops-dot ${cfg.dot} ${agent.status === 'online' ? 'ops-dot-pulse' : ''}`} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {agent.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
                          @{agent.handle} · {agent.agent_type || 'worker'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {alert && <AlertTriangle size={10} style={{ color: '#ef4444' }} />}
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: isRegisteredOnly ? 'var(--amber)' : cfg.color, textTransform: 'uppercase' }}>
                          {isRegisteredOnly ? 'REGISTERED' : cfg.label}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
                          {timeAgo(agent.last_seen || agent.last_heartbeat)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Machine fleet */}
          <div className="ops-panel p-5">
            <div className="flex items-center gap-2 mb-4">
              <Server size={13} style={{ color: 'var(--text-lo)' }} />
              <div className="ops-section-header">Machine Fleet</div>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>{machines.length} total</span>
            </div>
            {machines.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-lo)', padding: '24px 0', textAlign: 'center' }}>— no machines registered —</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {machines.map((m: any) => {
                  const cfg = MACHINE_CFG[m.status] || MACHINE_CFG.offline;
                  const specs = typeof m.metadata === 'string' ? (() => { try { return JSON.parse(m.metadata); } catch { return {}; } })() : (m.metadata || {});
                  return (
                    <div key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 3,
                      background: 'var(--ink-2)', border: '1px solid var(--ink-4)',
                    }}>
                      <span className="ops-dot" style={{ background: cfg.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.hostname || m.name || 'Unknown'}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-lo)' }}>
                          {m.ip_address || '—'}
                          {specs.os ? ` · ${specs.os}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.1em', color: cfg.color, textTransform: 'uppercase' }}>{cfg.label}</div>
                        {m.status === 'active' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}>
                            <CheckCircle size={9} style={{ color: '#10b981' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#10b981' }}>healthy</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Agent type breakdown */}
      {agents.length > 0 && (() => {
        const byType: Record<string, number> = {};
        agents.forEach(a => { const t = a.agent_type || 'worker'; byType[t] = (byType[t] || 0) + 1; });
        return (
          <div className="ops-panel p-5">
            <div className="ops-section-header mb-4">Agent Type Distribution</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(byType).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--ink-2)', borderRadius: 4, border: '1px solid var(--ink-4)' }}>
                  <Bot size={13} style={{ color: type === 'pm' ? 'var(--amber)' : type === 'rnd' ? 'var(--cyan)' : '#60a5fa', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-hi)', textTransform: 'uppercase' }}>{type}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text-hi)' }}>{count}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

    </div>
  );
}
