import { useEffect, useRef, useCallback, useState } from 'react';
import { Send, Hash, ChevronLeft, AtSign, Plus, MessageSquare, MessageCircle } from 'lucide-react';
import { wsClient } from '../services/api';
import { ChatSkeleton } from '../components/Skeleton';
import { useChatStore } from '../store/chatStore';
import type { Message, Channel, Agent } from '../store/chatStore';

// ── helpers ──────────────────────────────────────────────────────────────────

function agentColor(name: string): string {
  const palette = ['#4287f5', '#10a37f', '#faa81a', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c', '#ef4444'];
  const n = (name || '').toLowerCase();
  const named: Record<string, string> = {
    sigma: '#faa81a', leo: '#4287f5', leonardo: '#4287f5',
    mikey: '#f472b6', michelangelo: '#f472b6',
    donnie: '#a78bfa', donatello: '#a78bfa',
    raph: '#ef4444', raphael: '#ef4444',
  };
  for (const [k, v] of Object.entries(named)) if (n.includes(k)) return v;
  let h = 0;
  for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

function initials(name: string) {
  return (name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDate = (ts: string) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function groupByDate(msgs: Message[]) {
  const g: Record<string, Message[]> = {};
  for (const m of msgs) {
    const d = fmtDate(m.created_at);
    (g[d] = g[d] || []).push(m);
  }
  return g;
}

const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

interface ChatProps {
  currentUser?: { id: string; name: string; email?: string; role?: string } | null;
}

// ── component ────────────────────────────────────────────────────────────────

export default function Chat({ currentUser }: ChatProps) {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<'channels' | 'agents'>('channels');
  const [dmLoading, setDmLoading] = useState<string | null>(null);

  const channels = useChatStore(s => s.channels);
  const messages = useChatStore(s => s.messages);
  const channelMessages = useChatStore(s => s.channelMessages);
  const currentId = useChatStore(s => s.currentChannelId);
  const agents = useChatStore(s => s.agents);
  const isConnected = useChatStore(s => s.isConnected);
  const loading = useChatStore(s => s.loading);
  const error = useChatStore(s => s.error);
  const typingUsers = useChatStore(s => s.typingUsers);
  const setChannel = useChatStore(s => s.setCurrentChannel);
  const sendMsg = useChatStore(s => s.sendMessage);
  const clearErr = useChatStore(s => s.clearError);
  const openDm = useChatStore(s => s.openDm);

  const selectedCh = currentId ? channels[currentId] : null;
  const msgIds = currentId ? (channelMessages[currentId] || []) : [];
  const msgList = msgIds
    .map(id => messages[id])
    .filter(Boolean)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const channelsByType = Object.values(channels).reduce(
    (acc, ch) => { acc[ch.type]?.push(ch); return acc; },
    { general: [] as Channel[], project: [] as Channel[], dm: [] as Channel[] }
  );

  const endRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgList.length]);

  useEffect(() => {
    useChatStore.getState().fetchChannels();
    useChatStore.getState().fetchAgents();
  }, []);

  // Auto-select first general channel
  useEffect(() => {
    if (!currentId && channelsByType.general.length > 0) {
      setChannel(channelsByType.general[0].id);
    }
  }, [currentId, channelsByType.general.length]);

  // Subscribe to channel on WS connect
  useEffect(() => {
    if (isConnected && currentId) wsClient.subscribeToChannel(currentId);
  }, [currentId, isConnected]);

  const handleSend = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !currentId) return;
    const txt = input.trim();
    setInput('');
    await sendMsg(currentId, txt, currentUser || undefined);
  }, [input, currentId, sendMsg, currentUser]);

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (isConnected && currentId && e.target.value.trim()) {
      wsClient.sendTyping(currentId, true);
      if (typingRef.current) clearTimeout(typingRef.current);
      typingRef.current = setTimeout(() => wsClient.sendTyping(currentId, false), 3000);
    }
  };

  const startDm = async (agent: Agent) => {
    if (!currentUser?.id) return;
    setDmLoading(agent.id);
    try {
      const chId = await openDm(agent.id, currentUser.id);
      if (chId) { setChannel(chId); setSidebarOpen(true); setTab('channels'); }
    } finally {
      setDmLoading(null);
    }
  };

  if (loading && !selectedCh) return <ChatSkeleton />;

  // ── sidebar channel button ────────────────────────────────────────────────
  const ChBtn = ({ ch }: { ch: Channel }) => {
    const active = ch.id === currentId;
    const label = ch.type === 'dm'
      ? (ch.dm_agent_name || ch.name)
      : ch.name.replace('project-', '');
    const online = ch.dm_agent_status === 'online';

    return (
      <button
        onClick={() => { setChannel(ch.id); setSidebarOpen(false); }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px', border: 'none', cursor: 'pointer', borderRadius: 2,
          background: active ? 'var(--amber)18' : 'transparent',
          transition: 'background 100ms',
        }}
      >
        {ch.type === 'dm' ? (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 2,
              background: agentColor(label) + '33',
              border: `1px solid ${agentColor(label)}66`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...M, fontSize: 8, fontWeight: 700, color: agentColor(label),
            }}>{initials(label)}</div>
            <span style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 6, height: 6, borderRadius: '50%',
              background: online ? '#10b981' : '#4b5563',
              border: '1px solid var(--ink-2)',
            }} />
          </div>
        ) : (
          <Hash size={10} style={{ color: active ? 'var(--amber)' : 'var(--text-lo)', flexShrink: 0 }} />
        )}
        <span style={{
          ...M, fontSize: 11, flex: 1, textAlign: 'left',
          color: active ? 'var(--amber)' : 'var(--text-mid)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
        {(ch.unread_count || 0) > 0 && (
          <span style={{
            ...M, fontSize: 9, background: '#ef4444', color: '#fff',
            borderRadius: 9, padding: '1px 5px', flexShrink: 0,
          }}>{ch.unread_count}</span>
        )}
      </button>
    );
  };

  return (
    <div style={{
      height: 'calc(100vh - 7rem)', display: 'flex',
      border: '1px solid var(--ink-4)', borderRadius: 2,
      overflow: 'hidden', background: 'var(--ink-1)',
    }}>

      {/* ── LEFT SIDEBAR ────────────────────────────────────────────────── */}
      <aside style={{
        width: sidebarOpen ? 220 : 0, minWidth: sidebarOpen ? 220 : 0,
        background: 'var(--ink-2)', borderRight: '1px solid var(--ink-4)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 200ms ease, min-width 200ms ease', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '11px 14px', borderBottom: '1px solid var(--ink-4)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 2, background: 'var(--amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <MessageSquare size={11} style={{ color: '#000' }} />
          </div>
          <span style={{ ...M, fontSize: 12, fontWeight: 700, color: 'var(--text-hi)', whiteSpace: 'nowrap' }}>TMNT HQ</span>
          <span style={{
            marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: isConnected ? '#10b981' : '#ef4444',
          }} />
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--ink-4)', flexShrink: 0 }}>
          {(['channels', 'agents'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--ink-3)' : 'transparent',
              borderBottom: tab === t ? '1px solid var(--amber)' : '1px solid transparent',
              ...M, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: tab === t ? 'var(--amber)' : 'var(--text-lo)',
            }}>{t}</button>
          ))}
        </div>

        {/* CHANNELS TAB */}
        {tab === 'channels' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
            {error && (
              <div style={{
                ...M, fontSize: 10, color: '#ef4444', margin: '4px 6px 6px',
                background: '#ef444412', border: '1px solid #ef444430', borderRadius: 2,
                padding: '6px 8px', display: 'flex', gap: 6
              }}>
                <span style={{ flex: 1 }}>{error}</span>
                <button onClick={clearErr} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>×</button>
              </div>
            )}

            {/* General */}
            <div style={{
              ...M, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '6px 10px 3px'
            }}>General</div>
            {channelsByType.general.map(ch => <ChBtn key={ch.id} ch={ch} />)}

            {/* Projects */}
            {channelsByType.project.length > 0 && <>
              <div style={{
                ...M, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '10px 10px 3px'
              }}>Projects</div>
              {channelsByType.project.map(ch => <ChBtn key={ch.id} ch={ch} />)}
            </>}

            {/* DMs */}
            {channelsByType.dm.length > 0 && <>
              <div style={{
                ...M, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '10px 10px 3px'
              }}>Direct Messages</div>
              {channelsByType.dm.map(ch => <ChBtn key={ch.id} ch={ch} />)}
            </>}
          </div>
        )}

        {/* AGENTS TAB */}
        {tab === 'agents' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
            <div style={{
              ...M, fontSize: 9, color: 'var(--text-lo)', letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '6px 10px 3px'
            }}>
              {agents.filter(a => a.status === 'online').length} Online · {agents.filter(a => a.status !== 'online').length} Offline
            </div>
            {agents.map(agent => {
              const col = agentColor(agent.name);
              const online = agent.status === 'online';
              return (
                <div key={agent.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 2,
                }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 2,
                      background: col + '33', border: `1px solid ${col}66`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      ...M, fontSize: 10, fontWeight: 700, color: col,
                    }}>{initials(agent.name)}</div>
                    <span style={{
                      position: 'absolute', bottom: -1, right: -1,
                      width: 8, height: 8, borderRadius: '50%',
                      background: online ? '#10b981' : '#4b5563',
                      border: '1px solid var(--ink-2)',
                    }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      ...M, fontSize: 11, color: 'var(--text-hi)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {agent.name}
                    </div>
                    <div style={{ ...M, fontSize: 9, color: col }}>{agent.role}</div>
                  </div>
                  <button
                    onClick={() => startDm(agent)}
                    disabled={dmLoading === agent.id}
                    title="Open DM"
                    style={{
                      background: 'none', border: `1px solid var(--ink-4)`,
                      borderRadius: 2, padding: '3px 6px', cursor: 'pointer',
                      color: 'var(--text-lo)', display: 'flex', alignItems: 'center',
                      transition: 'all 100ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--amber)', e.currentTarget.style.color = 'var(--amber)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--ink-4)', e.currentTarget.style.color = 'var(--text-lo)')}
                  >
                    <MessageCircle size={11} />
                  </button>
                </div>
              );
            })}
            {agents.length === 0 && (
              <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', padding: '20px', textAlign: 'center' }}>
                — no agents registered —
              </div>
            )}
          </div>
        )}

        {/* User footer */}
        <div style={{
          padding: '9px 12px', borderTop: '1px solid var(--ink-4)',
          display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: 2, background: 'var(--amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, ...M, fontSize: 10, fontWeight: 700, color: '#000',
          }}>{initials(currentUser?.name || 'U')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              ...M, fontSize: 11, color: 'var(--text-hi)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {currentUser?.name || 'User'}
            </div>
            <div style={{ ...M, fontSize: 9, color: 'var(--amber)' }}>{currentUser?.role || 'user'}</div>
          </div>
        </div>
      </aside>

      {/* ── MAIN AREA ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Channel header */}
        <div style={{
          height: 44, background: 'var(--ink-2)', borderBottom: '1px solid var(--ink-4)',
          display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0,
        }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-lo)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 2,
          }}>
            <ChevronLeft size={13} style={{ transform: sidebarOpen ? 'none' : 'rotate(180deg)', transition: 'transform 200ms' }} />
          </button>

          {selectedCh?.type === 'dm' ? (
            <>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 2,
                  background: agentColor(selectedCh.dm_agent_name || selectedCh.name) + '33',
                  border: `1px solid ${agentColor(selectedCh.dm_agent_name || selectedCh.name)}66`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  ...M, fontSize: 10, fontWeight: 700,
                  color: agentColor(selectedCh.dm_agent_name || selectedCh.name),
                }}>{initials(selectedCh.dm_agent_name || selectedCh.name)}</div>
                <span style={{
                  position: 'absolute', bottom: -1, right: -1,
                  width: 7, height: 7, borderRadius: '50%',
                  background: selectedCh.dm_agent_status === 'online' ? '#10b981' : '#4b5563',
                  border: '1px solid var(--ink-2)',
                }} />
              </div>
              <span style={{ ...M, fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>
                {selectedCh.dm_agent_name || selectedCh.name}
              </span>
              <span style={{
                ...M, fontSize: 9, padding: '2px 7px', borderRadius: 2,
                background: selectedCh.dm_agent_status === 'online' ? '#10b98115' : '#4b556315',
                border: `1px solid ${selectedCh.dm_agent_status === 'online' ? '#10b98133' : '#4b556333'}`,
                color: selectedCh.dm_agent_status === 'online' ? '#10b981' : '#64748b',
              }}>{selectedCh.dm_agent_status === 'online' ? 'ONLINE' : 'OFFLINE'}</span>
            </>
          ) : (
            <>
              <Hash size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <span style={{ ...M, fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>
                {selectedCh?.name?.replace('project-', '') || '—'}
              </span>
              {selectedCh?.description && (
                <span style={{
                  ...M, fontSize: 10, color: 'var(--text-lo)',
                  borderLeft: '1px solid var(--ink-4)', paddingLeft: 10,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                }}>{selectedCh.description}</span>
              )}
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              ...M, fontSize: 9, padding: '3px 8px', borderRadius: 2, letterSpacing: '0.06em',
              color: isConnected ? '#10b981' : '#ef4444',
              background: isConnected ? '#10b98112' : '#ef444412',
              border: `1px solid ${isConnected ? '#10b98130' : '#ef444430'}`,
            }}>● {isConnected ? 'LIVE' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {msgList.length === 0 && typingUsers.size === 0 ? (
            <div style={{
              height: '100%', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10, opacity: 0.5
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 2,
                background: 'var(--ink-3)', border: '1px solid var(--ink-4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Hash size={18} style={{ color: 'var(--text-lo)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ ...M, fontSize: 12, color: 'var(--text-mid)', fontWeight: 700 }}>
                  {selectedCh ? `#${selectedCh.name.replace('project-', '')}` : 'Select a channel'}
                </div>
                <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', marginTop: 4 }}>
                  No messages yet — start the conversation
                </div>
              </div>
            </div>
          ) : (
            Object.entries(groupByDate(msgList)).map(([date, msgs]) => (
              <div key={date}>
                {/* Date divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--ink-4)' }} />
                  <span style={{
                    ...M, fontSize: 9, color: 'var(--text-lo)',
                    letterSpacing: '0.08em', textTransform: 'uppercase'
                  }}>{date}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--ink-4)' }} />
                </div>

                {msgs.map((msg, idx) => {
                  const isMe = msg.user_id === currentUser?.id || msg.sender_id === currentUser?.id;
                  const showHd = idx === 0 || msgs[idx - 1].sender_id !== msg.sender_id || msgs[idx - 1].user_id !== msg.user_id;
                  const name = msg.sender_name || msg.user_name || msg.agent_name || 'Unknown';
                  const col = isMe ? 'var(--amber)' : agentColor(name);

                  return (
                    <div key={msg.id} style={{
                      display: 'flex', gap: 8, marginBottom: showHd ? 10 : 2,
                      flexDirection: isMe ? 'row-reverse' : 'row',
                      opacity: msg.isOptimistic ? 0.6 : 1,
                      transition: 'opacity 150ms',
                    }}>
                      {/* Avatar */}
                      <div style={{ width: 26, height: 26, flexShrink: 0, marginTop: 2 }}>
                        {showHd ? (
                          <div style={{
                            width: 26, height: 26, borderRadius: 2,
                            background: col + '33', border: `1px solid ${col}55`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            ...M, fontSize: 9, fontWeight: 700, color: col,
                          }}>{initials(name)}</div>
                        ) : <div style={{ width: 26 }} />}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0, textAlign: isMe ? 'right' : 'left' }}>
                        {showHd && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                            justifyContent: isMe ? 'flex-end' : 'flex-start',
                          }}>
                            <span style={{ ...M, fontSize: 11, fontWeight: 700, color: col }}>{name}</span>
                            {msg.agent_role && (
                              <span style={{
                                ...M, fontSize: 9, color: 'var(--text-lo)',
                                background: 'var(--ink-3)', border: '1px solid var(--ink-4)',
                                borderRadius: 2, padding: '1px 5px',
                              }}>{msg.agent_role}</span>
                            )}
                            <span style={{ ...M, fontSize: 9, color: 'var(--text-lo)' }}>
                              {fmtTime(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div style={{
                          display: 'inline-block', textAlign: 'left', maxWidth: '76%',
                          background: isMe ? 'var(--amber)1a' : 'var(--ink-3)',
                          border: `1px solid ${isMe ? 'var(--amber)44' : 'var(--ink-4)'}`,
                          borderRadius: 2, padding: '6px 11px',
                        }}>
                          <div style={{
                            ...M, fontSize: 12, color: 'var(--text-hi)', lineHeight: 1.6,
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                          }}>
                            {msg.content.split(/(@\w+)/g).map((part, i) =>
                              part.startsWith('@') ? (
                                <span key={i} style={{
                                  color: 'var(--amber)', background: 'var(--amber)18',
                                  borderRadius: 2, padding: '0 3px',
                                }}>{part}</span>
                              ) : <span key={i}>{part}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* Typing indicator */}
          {typingUsers.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingLeft: 34 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 5, height: 5, borderRadius: '50%', background: 'var(--text-lo)',
                  display: 'inline-block', animation: 'bounce 1s infinite',
                  animationDelay: `${i * 150}ms`,
                }} />
              ))}
              <span style={{ ...M, fontSize: 9, color: 'var(--text-lo)', marginLeft: 4 }}>
                {Array.from(typingUsers)[0]} is typing
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 14px', background: 'var(--ink-2)',
          borderTop: '1px solid var(--ink-4)', flexShrink: 0,
        }}>
          <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-lo)', display: 'flex', alignItems: 'center', padding: 4,
            }}><Plus size={13} /></button>

            <input
              type="text"
              value={input}
              onChange={handleTyping}
              placeholder={`Message ${selectedCh ? '#' + selectedCh.name.replace('project-', '') : '...'}`}
              disabled={!currentId}
              style={{
                flex: 1, background: 'var(--ink-3)', border: '1px solid var(--ink-4)',
                borderRadius: 2, padding: '8px 12px', ...M, fontSize: 12,
                color: 'var(--text-hi)', outline: 'none', transition: 'border-color 150ms',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--amber)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--ink-4)'; }}
            />

            <button type="button" style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-lo)', display: 'flex', alignItems: 'center', padding: 4,
            }}><AtSign size={12} /></button>

            <button type="submit" disabled={!input.trim() || !currentId} style={{
              background: input.trim() ? 'var(--amber)' : 'var(--ink-3)',
              border: `1px solid ${input.trim() ? 'var(--amber)' : 'var(--ink-4)'}`,
              borderRadius: 2, padding: '7px 14px', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 5,
              color: input.trim() ? '#000' : 'var(--text-lo)',
              transition: 'all 150ms',
            }}><Send size={12} /></button>
          </form>

          <div style={{ ...M, fontSize: 9, color: 'var(--text-lo)', marginTop: 5, display: 'flex', gap: 12 }}>
            <span>Enter to send</span><span>·</span>
            <span>@ to mention</span><span>·</span>
            <span>{typingUsers.size > 0 ? `${Array.from(typingUsers)[0]} is typing…` : 'Markdown supported'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}