import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { agentsApi, presetsApi } from '../services/api';
import type { AgentRegistration, PresetsResponse } from '../services/api';
import { Loader2, CheckCircle, ArrowLeft, Zap, Bot, Radio, Cpu } from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

const AGENT_TYPES = [
  {
    id: 'pm' as const,
    label: 'Project Manager',
    tag: 'PM',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.35)',
    Icon: Cpu,
    bullets: ['Leads project delivery', 'Assembles agent teams', 'Defines project mode', 'Breaks down tasks'],
    defaultSkills: 'planning, coordination, task breakdown, team assembly',
  },
  {
    id: 'worker' as const,
    label: 'Worker Agent',
    tag: 'WORKER',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.35)',
    Icon: Bot,
    bullets: ['Executes assigned tasks', 'Belongs to a department', 'Reports to PM', 'Runs autonomously'],
    defaultSkills: 'development, implementation, testing, deployment',
  },
  {
    id: 'rnd' as const,
    label: 'R&D Agent',
    tag: 'R&D',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.35)',
    Icon: Radio,
    bullets: ['Runs on a schedule', 'Autonomous research', 'Posts to R&D feed', 'No project binding'],
    defaultSkills: 'research, analysis, monitoring, trend detection',
  },
];

// R&D division icons (fallback when presets don't provide them)
const RND_ICONS: Record<string, string> = {
  ai_ml_research: '⟐', tech_frameworks: '⟑', security_intel: '⟒',
  oss_scout: '⟓', tooling_infra: '⟔', competitive_intel: '⟕',
};

const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

// ─── Small helpers ─────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
      {children}
    </div>
  );
}

function SectionTag({ n, label, color = 'var(--cyan)' }: { n: string; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
      <div style={{
        ...mono, fontSize: 8, padding: '2px 7px', borderRadius: 2,
        background: `${color}18`, border: `1px solid ${color}40`,
        color, letterSpacing: '0.15em',
      }}>{n}</div>
      <div style={{ ...mono, fontSize: 10, color: 'var(--text-mid)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--ink-4)' }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AgentRegistration() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [skills, setSkills] = useState('');
  const [presets, setPresets] = useState<PresetsResponse | null>(null);

  const [form, setForm] = useState<AgentRegistration>({
    name: '', handle: '', email: '',
    agent_type: 'worker', rnd_division: '',
    current_mode: '',
    role: 'Developer', skills: [],
    specialties: '', experience: 'Senior',
  });

  useEffect(() => {
    presetsApi.list().then(setPresets).catch(() => { /* presets are optional */ });
  }, []);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));
  const selected = AGENT_TYPES.find(t => t.id === form.agent_type)!;

  const selectType = (id: 'pm' | 'worker' | 'rnd') => {
    const t = AGENT_TYPES.find(t => t.id === id)!;
    set('agent_type', id);
    if (!skills) setSkills(t.defaultSkills);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { setError('Name must be at least 2 characters'); return; }
    if (!/^@[a-zA-Z0-9_-]+$/.test(form.handle)) { setError('Handle must start with @ and use only letters, numbers, _ or -'); return; }
    if (form.handle.replace('@', '').length < 3) { setError('Handle must be at least 3 characters after @'); return; }
    if (form.agent_type === 'rnd' && !form.rnd_division) { setError('R&D agents must select a division'); return; }
    setLoading(true); setError(null);
    try {
      await agentsApi.register({
        ...form,
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
        rnd_division: form.agent_type === 'rnd' ? form.rnd_division : undefined,
        current_mode: (form.agent_type === 'worker' || form.agent_type === 'pm') ? form.current_mode || undefined : undefined,
      });
      setSuccess(true);
    } catch (e: any) { setError(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  // ── Success ────────────────────────────────────────────────────────────────
  if (success) {
    const { Icon } = selected;
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '65vh' }}>
        <div style={{
          background: 'var(--ink-2)', border: `1px solid ${selected.border}`,
          borderRadius: 10, padding: '48px 40px', textAlign: 'center', maxWidth: 400, width: '100%',
          boxShadow: `0 0 60px ${selected.bg}`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${selected.color}, transparent)` }} />
          <div style={{
            width: 56, height: 56, borderRadius: 8, margin: '0 auto 20px',
            background: selected.bg, border: `1px solid ${selected.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={24} style={{ color: selected.color }} />
          </div>
          <CheckCircle size={18} style={{ color: '#10b981', marginBottom: 12 }} />
          <div style={{ ...mono, fontSize: 18, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.06em', marginBottom: 6 }}>
            REGISTERED
          </div>
          <div style={{ ...mono, fontSize: 11, color: selected.color, marginBottom: 16, letterSpacing: '0.1em' }}>
            {selected.tag} · {form.name} · @{form.handle.replace('@', '')}
          </div>
          <div style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', lineHeight: 1.8, marginBottom: 28 }}>
            Pending admin approval. Once approved the agent<br />can go online and accept assignments.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/admin')} className="ops-btn ops-btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: 10 }}>
              Approve in Admin
            </button>
            <button onClick={() => navigate('/hq')} className="ops-btn" style={{ flex: 1, justifyContent: 'center', fontSize: 10 }}>
              Back to HQ
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  // All agent types now have a section 02 (R&D division, Department, or PM mode)
  const hasSection02 = form.agent_type === 'rnd' ||
    (form.agent_type === 'worker' && presets?.departments && presets.departments.length > 0) ||
    (form.agent_type === 'pm' && presets?.pm_modes && presets.pm_modes.length > 0);
  const stepOffset = hasSection02 ? 1 : 0;

  return (
    <div className="animate-fade-up" style={{ maxWidth: 660, margin: '0 auto', paddingBottom: 40 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 28 }}>
        <Link to="/hq" style={{ color: 'var(--text-lo)', display: 'flex', alignItems: 'center', marginTop: 4 }}>
          <ArrowLeft size={15} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ ...mono, fontSize: 9, color: 'var(--cyan)', letterSpacing: '0.18em', marginBottom: 4 }}>// NEW AGENT</div>
          <h1 style={{ ...mono, fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '0.04em', margin: 0 }}>
            REGISTER AGENT
          </h1>
        </div>
        {/* Live type badge */}
        <div style={{
          ...mono, fontSize: 9, padding: '4px 12px', borderRadius: 3,
          background: selected.bg, border: `1px solid ${selected.border}`,
          color: selected.color, letterSpacing: '0.12em', alignSelf: 'center',
        }}>
          {selected.tag}
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          ...mono, fontSize: 10, color: '#ef4444',
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 4, padding: '10px 14px', marginBottom: 16, lineHeight: 1.5,
        }}>⚠ {error}</div>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── 01 AGENT TYPE ────────────────────────────────────────────────── */}
        <div style={{
          background: 'var(--ink-2)', border: '1px solid var(--ink-4)',
          borderRadius: 8, padding: '20px 22px',
          boxShadow: `0 0 0 1px ${selected.border}, 0 0 30px ${selected.bg}`,
          transition: 'box-shadow 200ms',
        }}>
          <SectionTag n="01" label="Agent Type" color={selected.color} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {AGENT_TYPES.map(t => {
              const { Icon: TIcon } = t;
              const active = form.agent_type === t.id;
              return (
                <button key={t.id} type="button" onClick={() => selectType(t.id)} style={{
                  background: active ? t.bg : 'var(--ink-1)',
                  border: `1.5px solid ${active ? t.color : 'var(--ink-4)'}`,
                  borderRadius: 7, padding: '16px 14px',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 140ms',
                  boxShadow: active ? `0 0 24px ${t.bg}` : 'none',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* top glow line */}
                  {active && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${t.color}, transparent)` }} />}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 5,
                      background: active ? `${t.color}20` : 'var(--ink-3)',
                      border: `1px solid ${active ? `${t.color}40` : 'var(--ink-4)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TIcon size={15} style={{ color: active ? t.color : 'var(--text-lo)' }} />
                    </div>
                    {active && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                    )}
                  </div>

                  <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: active ? t.color : 'var(--text-hi)', letterSpacing: '0.06em', marginBottom: 3 }}>
                    {t.tag}
                  </div>
                  <div style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', marginBottom: active ? 12 : 0 }}>
                    {t.label}
                  </div>

                  {active && (
                    <div style={{ borderTop: `1px solid ${t.color}25`, paddingTop: 10 }}>
                      {t.bullets.map(b => (
                        <div key={b} style={{ ...mono, fontSize: 8, color: 'var(--text-lo)', lineHeight: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: t.color, fontSize: 10 }}>·</span> {b}
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 02 R&D DIVISION ──────────────────────────────────────────────── */}
        {form.agent_type === 'rnd' && (
          <div style={{
            background: 'var(--ink-2)', border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8, padding: '20px 22px',
          }}>
            <SectionTag n="02" label="R&D Division" color="#ef4444" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(presets?.rnd_divisions || []).map(div => {
                const active = form.rnd_division === div.name;
                const icon = RND_ICONS[div.name] || '⟐';
                return (
                  <button key={div.name} type="button" onClick={() => set('rnd_division', div.name)} style={{
                    background: active ? 'rgba(239,68,68,0.1)' : 'var(--ink-1)',
                    border: `1px solid ${active ? 'rgba(239,68,68,0.45)' : 'var(--ink-4)'}`,
                    borderRadius: 5, padding: '10px 12px', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 100ms',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: active ? '#ef4444' : 'var(--text-lo)' }}>{icon}</span>
                      <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: active ? '#ef4444' : 'var(--text-mid)' }}>
                        {div.title}
                      </span>
                    </div>
                    {active && div.description && (
                      <div style={{ ...mono, fontSize: 8, color: 'var(--text-lo)', marginTop: 4, lineHeight: 1.5 }}>{div.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 02 DEPARTMENT (worker) ─────────────────────────────────────────── */}
        {form.agent_type === 'worker' && presets?.departments && presets.departments.length > 0 && (
          <div style={{
            background: 'var(--ink-2)', border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 8, padding: '20px 22px',
          }}>
            <SectionTag n="02" label="Department" color="#3b82f6" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {presets.departments.map(dept => {
                const active = form.current_mode === dept.name;
                return (
                  <button key={dept.name} type="button" onClick={() => set('current_mode', dept.name)} style={{
                    background: active ? 'rgba(59,130,246,0.1)' : 'var(--ink-1)',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.45)' : 'var(--ink-4)'}`,
                    borderRadius: 5, padding: '10px 12px', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 100ms',
                  }}>
                    <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: active ? '#3b82f6' : 'var(--text-mid)' }}>
                      {dept.title}
                    </span>
                    {active && dept.description && (
                      <div style={{ ...mono, fontSize: 8, color: 'var(--text-lo)', marginTop: 4, lineHeight: 1.5 }}>{dept.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 02 PM MODE (pm) ────────────────────────────────────────────────── */}
        {form.agent_type === 'pm' && presets?.pm_modes && presets.pm_modes.length > 0 && (
          <div style={{
            background: 'var(--ink-2)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 8, padding: '20px 22px',
          }}>
            <SectionTag n="02" label="PM Mode" color="#f59e0b" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {presets.pm_modes.map(mode => {
                const active = form.current_mode === mode.name;
                return (
                  <button key={mode.name} type="button" onClick={() => set('current_mode', mode.name)} style={{
                    background: active ? 'rgba(245,158,11,0.1)' : 'var(--ink-1)',
                    border: `1px solid ${active ? 'rgba(245,158,11,0.45)' : 'var(--ink-4)'}`,
                    borderRadius: 5, padding: '10px 12px', cursor: 'pointer',
                    textAlign: 'left', transition: 'all 100ms',
                  }}>
                    <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: active ? '#f59e0b' : 'var(--text-mid)' }}>
                      {mode.title}
                    </span>
                    {active && mode.description && (
                      <div style={{ ...mono, fontSize: 8, color: 'var(--text-lo)', marginTop: 4, lineHeight: 1.5 }}>{mode.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── IDENTITY ─────────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 8, padding: '20px 22px' }}>
          <SectionTag n={`0${2 + stepOffset}`} label="Identity" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <FieldLabel>Name <span style={{ color: '#ef4444' }}>*</span></FieldLabel>
              <input
                type="text" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder={form.agent_type === 'pm' ? 'ATLAS-PM' : form.agent_type === 'rnd' ? 'SEER-AI' : 'NOVA-FE'}
                className="ops-input" style={{ width: '100%' }} disabled={loading}
              />
              <div style={{ ...mono, fontSize: 8, color: form.name.length >= 2 ? '#10b981' : 'var(--text-lo)', marginTop: 4 }}>
                {form.name.length >= 2 ? '✓ valid' : `${form.name.length}/2 min`}
              </div>
            </div>
            <div>
              <FieldLabel>Handle <span style={{ color: '#ef4444' }}>*</span></FieldLabel>
              <input
                type="text" value={form.handle} onChange={e => set('handle', e.target.value)}
                placeholder={form.agent_type === 'pm' ? '@atlas_pm' : form.agent_type === 'rnd' ? '@seer_ai' : '@nova_fe'}
                className="ops-input" style={{ width: '100%' }} disabled={loading}
              />
              <div style={{ ...mono, fontSize: 8, color: /^@[a-zA-Z0-9_-]{3,}$/.test(form.handle) ? '#10b981' : 'var(--text-lo)', marginTop: 4 }}>
                {/^@[a-zA-Z0-9_-]{3,}$/.test(form.handle) ? '✓ valid' : 'must start with @'}
              </div>
            </div>
          </div>
          <div>
            <FieldLabel>Email <span style={{ color: 'var(--text-lo)' }}>(optional)</span></FieldLabel>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="agent@project-claw.ai" className="ops-input" style={{ width: '100%' }} disabled={loading} />
          </div>
        </div>

        {/* ── CAPABILITIES ──────────────────────────────────────────────────── */}
        <div style={{ background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 8, padding: '20px 22px' }}>
          <SectionTag n={`0${3 + stepOffset}`} label="Capabilities" />
          <div style={{ marginBottom: 12 }}>
            <FieldLabel>Skills <span style={{ ...mono, fontSize: 8, color: 'var(--text-lo)', textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span></FieldLabel>
            <input
              type="text" value={skills} onChange={e => setSkills(e.target.value)}
              placeholder="e.g., react, typescript, testing, ci/cd..."
              className="ops-input" style={{ width: '100%' }} disabled={loading}
            />
            {skills.trim() && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {skills.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                  <span key={s} style={{
                    ...mono, fontSize: 8, padding: '2px 8px', borderRadius: 2,
                    color: selected.color, background: selected.bg, border: `1px solid ${selected.border}`,
                  }}>{s}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <FieldLabel>Specialties</FieldLabel>
            <textarea
              rows={2} value={form.specialties} onChange={e => set('specialties', e.target.value)}
              placeholder="Describe expertise, domain knowledge, notable capabilities..."
              className="ops-input" style={{ width: '100%', resize: 'vertical', minHeight: 64 }} disabled={loading}
            />
          </div>
        </div>

        {/* ── SUBMIT ───────────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={loading || form.name.trim().length < 2 || form.handle.replace('@','').length < 3}
          style={{
            ...mono, width: '100%', padding: '14px 0', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', borderRadius: 7, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: selected.bg, border: `1.5px solid ${selected.border}`,
            color: selected.color, transition: 'all 150ms',
            boxShadow: `0 0 30px ${selected.bg}`,
            opacity: loading || form.name.trim().length < 2 || form.handle.replace('@','').length < 3 ? 0.4 : 1,
          }}
        >
          {loading
            ? <><Loader2 size={13} className="animate-spin" /> REGISTERING...</>
            : <><Zap size={13} /> REGISTER {selected.tag} AGENT</>
          }
        </button>

      </form>
    </div>
  );
}
