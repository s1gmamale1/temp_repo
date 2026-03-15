import { useState, useEffect, useCallback } from 'react';
import { rndApi } from '../services/api';
import type { RndAgent, RndFinding } from '../services/api';
import { FlaskConical, Loader2, RefreshCw, Play, Clock, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react';

const SCHEDULE_OPTIONS = [
  { value: 'every_4h', label: 'Every 4 hours' },
  { value: 'every_6h', label: 'Every 6 hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const IMPACT_COLORS: Record<string, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

function timeAgo(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export default function RndPanel() {
  const [agents, setAgents] = useState<RndAgent[]>([]);
  const [feed, setFeed] = useState<RndFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, feedRes] = await Promise.allSettled([
        rndApi.getStatus(),
        rndApi.getFeed(),
      ]);
      if (statusRes.status === 'fulfilled') setAgents(statusRes.value.agents || []);
      if (feedRes.status === 'fulfilled') setFeed(feedRes.value.messages || []);
    } catch {
      // errors handled by global handler
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh feed every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await rndApi.getFeed();
        setFeed(res.messages || []);
      } catch {
        // silent
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleExecute = async (agentId: string) => {
    setExecuting(agentId);
    try {
      const res = await rndApi.execute(agentId);
      showToast('success', `Execution complete — impact: ${res.impact_level}`);
      // Refresh data
      const [statusRes, feedRes] = await Promise.allSettled([
        rndApi.getStatus(),
        rndApi.getFeed(),
      ]);
      if (statusRes.status === 'fulfilled') setAgents(statusRes.value.agents || []);
      if (feedRes.status === 'fulfilled') setFeed(feedRes.value.messages || []);
    } catch (e: any) {
      showToast('error', e.message || 'Execution failed');
    } finally {
      setExecuting(null);
    }
  };

  const handleScheduleChange = async (agentId: string, schedule: string) => {
    try {
      await rndApi.updateSchedule(agentId, schedule);
      showToast('success', 'Schedule updated');
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, rnd_schedule: schedule } : a));
    } catch (e: any) {
      showToast('error', e.message || 'Failed to update schedule');
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="bg-gray-900 min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo-400" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink-1)' }}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FlaskConical size={22} className="text-indigo-400" />
          <div>
            <h1 className="text-xl font-bold text-white">R&D Control Panel</h1>
            <p className="text-gray-500 text-sm">{agents.length} research agents</p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Section 1: R&D Agents */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Agents Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              {/* Top row: name + status */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    agent.status === 'online' || agent.status === 'working' ? 'bg-green-400' : 'bg-gray-500'
                  }`} />
                  <span className="text-white font-medium truncate">{agent.name}</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 flex-shrink-0">
                  {agent.rnd_division}
                </span>
              </div>

              {/* Model badge */}
              <div className="mb-3">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                  {agent.model}
                </span>
              </div>

              {/* Schedule */}
              <div className="flex items-center gap-2 mb-3">
                <Clock size={12} className="text-gray-500" />
                <select
                  value={agent.rnd_schedule || agent.default_schedule || 'daily'}
                  onChange={e => handleScheduleChange(agent.id, e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-indigo-500"
                >
                  {SCHEDULE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {agent.scheduled && (
                  <span className="flex items-center gap-1 text-green-400 text-xs">
                    <CheckCircle size={12} />
                    Scheduled
                  </span>
                )}
              </div>

              {/* Last run */}
              <div className="text-xs text-gray-500 mb-3">
                Last run: {timeAgo(agent.rnd_last_run)}
              </div>

              {/* Run Now button */}
              <button
                onClick={() => handleExecute(agent.id)}
                disabled={executing === agent.id || !agent.is_approved}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  executing === agent.id
                    ? 'bg-indigo-600/50 text-indigo-300 cursor-wait'
                    : !agent.is_approved
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
              >
                {executing === agent.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Run Now
                  </>
                )}
              </button>
            </div>
          ))}

          {agents.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              No R&D agents registered yet.
            </div>
          )}
        </div>
      </div>

      {/* Section 2: R&D Feed */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Research Feed</h2>
        <div className="space-y-3">
          {feed.map(finding => {
            const isExpanded = expanded.has(finding.id);
            const needsTruncate = finding.content.length > 200;
            const displayContent = isExpanded || !needsTruncate
              ? finding.content
              : finding.content.slice(0, 200) + '...';
            const impactClass = IMPACT_COLORS[finding.metadata?.impact_level] || IMPACT_COLORS.low;
            const totalTokens = (finding.metadata?.tokens?.prompt || 0) + (finding.metadata?.tokens?.completion || 0);

            return (
              <div key={finding.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                {/* Header row */}
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <span className="text-white text-sm font-medium">{finding.agent_name || 'Unknown Agent'}</span>
                  {finding.rnd_division && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400">
                      {finding.rnd_division}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${impactClass}`}>
                    {finding.metadata?.impact_level || 'low'}
                  </span>
                  {finding.metadata?.skipped && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400">
                      Simulated
                    </span>
                  )}
                  <span className="text-gray-500 text-xs ml-auto">{timeAgo(finding.created_at)}</span>
                </div>

                {/* Content */}
                <div
                  className={`text-gray-300 text-sm whitespace-pre-wrap mb-2 ${needsTruncate ? 'cursor-pointer' : ''}`}
                  onClick={() => needsTruncate && toggleExpand(finding.id)}
                >
                  {displayContent}
                </div>
                {needsTruncate && (
                  <button
                    onClick={() => toggleExpand(finding.id)}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mb-2"
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}

                {/* Footer: model + tokens + cost */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{finding.metadata?.model || '—'}</span>
                  <span>{totalTokens.toLocaleString()} tokens</span>
                  <span>${(finding.metadata?.cost || 0).toFixed(4)}</span>
                </div>
              </div>
            );
          })}

          {feed.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No research findings yet. Run an agent to generate findings.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
