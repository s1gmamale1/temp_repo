import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { agentsApi } from '../services/api';
import type { AgentRegistration } from '../services/api';
import { Bot, Loader2, CheckCircle, ChevronDown, Key, Eye, EyeOff, ArrowLeft } from 'lucide-react';

const ROLES = ['Task Lead', 'Researcher', 'Developer', 'Designer', 'QA', 'DevOps'] as const;
const EXP = [
  { value: 'Junior', label: 'Junior  · 0–2 yrs' },
  { value: 'Mid', label: 'Mid     · 2–5 yrs' },
  { value: 'Senior', label: 'Senior  · 5–8 yrs' },
  { value: 'Expert', label: 'Expert  · 8+ yrs' },
] as const;

const m: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ ...m, fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{children}</div>
);

const Section = ({ n, title }: { n: number; title: string }) => (
  <div className="flex items-center gap-3 mb-4" style={{ borderBottom: '1px solid var(--ink-4)', paddingBottom: 10 }}>
    <div style={{ width: 22, height: 22, borderRadius: 2, background: 'var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...m, fontSize: 11, fontWeight: 700, color: '#000', flexShrink: 0 }}>{n}</div>
    <span style={{ ...m, fontSize: 11, letterSpacing: '0.1em', color: 'var(--text-mid)', textTransform: 'uppercase' }}>{title}</span>
  </div>
);

export default function AgentRegistration() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [showOAI, setShowOAI] = useState(false);
  const [showMS, setShowMS] = useState(false);
  const [skills, setSkills] = useState('planning, architecture, coordination');
  const [form, setForm] = useState<AgentRegistration>({
    name: '', handle: '', email: '', role: 'Task Lead',
    skills: [], specialties: '', experience: 'Senior', apiKeys: {}
  });

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { setError('Name must be at least 2 characters'); return; }
    if (!/^@[a-zA-Z0-9_-]+$/.test(form.handle)) { setError('Handle must start with @ and use only letters, numbers, _ or -'); return; }
    if (form.handle.replace('@', '').length < 3) { setError('Handle must be at least 3 characters after @'); return; }
    setLoading(true); setError(null);
    try {
      await agentsApi.register({ ...form, skills: skills.split(',').map(s => s.trim()).filter(Boolean) });
      setSuccess(true);
    } catch (e: any) { setError(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  if (success) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="ops-panel p-10 text-center space-y-5" style={{ maxWidth: 460, width: '100%' }}>
        <div style={{ width: 48, height: 48, borderRadius: 2, background: '#10b98120', border: '1px solid #10b98140', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <CheckCircle size={22} style={{ color: '#10b981' }} />
        </div>
        <div>
          <div style={{ ...m, fontSize: 16, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.01em' }}>REGISTRATION SUBMITTED</div>
          <div style={{ ...m, fontSize: 11, color: 'var(--text-lo)', marginTop: 8, lineHeight: 1.6 }}>Pending admin approval. You'll be notified once reviewed.</div>
        </div>
        <div className="flex gap-2 justify-center">
          <button onClick={() => navigate('/agents')} className="ops-btn">View Agents</button>
          <button onClick={() => navigate('/')} className="ops-btn">Dashboard</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade-up" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/agents" style={{ color: 'var(--text-lo)', display: 'flex', alignItems: 'center' }}><ArrowLeft size={16} /></Link>
        <div>
          <div className="ops-section-header" style={{ marginBottom: 2 }}>Admin</div>
          <h1 style={{ ...m, fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>REGISTER AGENT</h1>
        </div>
      </div>

      {error && (
        <div style={{ ...m, fontSize: 11, color: '#ef4444', background: 'var(--ink-2)', border: '1px solid #7f1d1d', borderRadius: 2, padding: '10px 14px', marginBottom: 16 }}>
          ERR: {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">

        {/* 1 — Identity */}
        <div className="ops-panel p-5">
          <Section n={1} title="Identity" />
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <Label>Name <span style={{ color: '#ef4444' }}>*</span></Label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g., Sigma"
                className="ops-input" style={{ width: '100%' }} disabled={loading} />
              <div style={{ ...m, fontSize: 9, color: form.name.length >= 2 ? '#10b981' : 'var(--text-lo)', marginTop: 4 }}>{form.name.length}/2+ chars</div>
            </div>
            <div>
              <Label>Handle <span style={{ color: '#ef4444' }}>*</span></Label>
              <input type="text" value={form.handle} onChange={e => set('handle', e.target.value)} placeholder="@sigma"
                className="ops-input" style={{ width: '100%' }} disabled={loading} />
              <div style={{ ...m, fontSize: 9, color: form.handle.replace('@', '').length >= 3 ? '#10b981' : 'var(--text-lo)', marginTop: 4 }}>{form.handle.replace('@', '').length}/3+ after @</div>
            </div>
          </div>
          <div>
            <Label>Email <span style={{ color: 'var(--text-lo)' }}>(optional)</span></Label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="sigma@project-claw.ai"
              className="ops-input" style={{ width: '100%' }} disabled={loading} />
          </div>
        </div>

        {/* 2 — Role */}
        <div className="ops-panel p-5">
          <Section n={2} title="Role & Experience" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Role <span style={{ color: '#ef4444' }}>*</span></Label>
              <div style={{ position: 'relative' }}>
                <select value={form.role} onChange={e => set('role', e.target.value)} className="ops-input" style={{ width: '100%', cursor: 'pointer', appearance: 'none', paddingRight: 28 }} disabled={loading}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)', pointerEvents: 'none' }} />
              </div>
            </div>
            <div>
              <Label>Experience <span style={{ color: '#ef4444' }}>*</span></Label>
              <div style={{ position: 'relative' }}>
                <select value={form.experience} onChange={e => set('experience', e.target.value)} className="ops-input" style={{ width: '100%', cursor: 'pointer', appearance: 'none', paddingRight: 28 }} disabled={loading}>
                  {EXP.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>
        </div>

        {/* 3 — Skills */}
        <div className="ops-panel p-5">
          <Section n={3} title="Skills & Specialties" />
          <div className="mb-3">
            <Label>Skills <span style={{ ...m, fontSize: 9, color: 'var(--text-lo)', textTransform: 'none' }}>(comma-separated)</span></Label>
            <input type="text" value={skills} onChange={e => setSkills(e.target.value)} placeholder="planning, react, python..."
              className="ops-input" style={{ width: '100%' }} disabled={loading} />
            {/* tag preview */}
            {skills && (
              <div className="flex flex-wrap gap-1 mt-2">
                {skills.split(',').map(s => s.trim()).filter(Boolean).map(s => (
                  <span key={s} style={{ ...m, fontSize: 9, color: 'var(--amber)', background: 'var(--amber)15', border: '1px solid var(--amber)33', borderRadius: 2, padding: '2px 7px' }}>{s}</span>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label>Specialties</Label>
            <textarea rows={3} value={form.specialties} onChange={e => set('specialties', e.target.value)}
              placeholder="Describe expertise, notable capabilities..." className="ops-input" style={{ width: '100%', resize: 'vertical', minHeight: 72 }} disabled={loading} />
          </div>
        </div>

        {/* 4 — API Keys (collapsible) */}
        <div className="ops-panel p-5">
          <button type="button" onClick={() => setShowKeys(!showKeys)}
            className="flex items-center gap-2 w-full" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <Key size={12} style={{ color: 'var(--text-lo)' }} />
            <span style={{ ...m, fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-mid)', textTransform: 'uppercase' }}>API Keys</span>
            <span style={{ ...m, fontSize: 9, color: 'var(--text-lo)', marginLeft: 4 }}>(optional)</span>
            <ChevronDown size={11} style={{ marginLeft: 'auto', color: 'var(--text-lo)', transform: showKeys ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
          </button>

          {showKeys && (
            <div className="mt-4 space-y-3" style={{ borderTop: '1px solid var(--ink-4)', paddingTop: 14 }}>
              {[
                { key: 'openai', label: 'OpenAI API Key', placeholder: 'sk-...', show: showOAI, toggle: () => setShowOAI(!showOAI) },
                { key: 'moonshot', label: 'Moonshot API Key', placeholder: 'ms-...', show: showMS, toggle: () => setShowMS(!showMS) },
              ].map(k => (
                <div key={k.key}>
                  <Label>{k.label}</Label>
                  <div style={{ position: 'relative' }}>
                    <input type={k.show ? 'text' : 'password'} value={(form.apiKeys as any)?.[k.key] || ''}
                      onChange={e => set('apiKeys', { ...form.apiKeys, [k.key]: e.target.value })}
                      placeholder={k.placeholder} className="ops-input" style={{ width: '100%', paddingRight: 32 }} disabled={loading} />
                    <button type="button" onClick={k.toggle} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-lo)', display: 'flex', alignItems: 'center' }}>
                      {k.show ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Note */}
        <div style={{ ...m, fontSize: 10, color: 'var(--text-lo)', background: 'var(--ink-2)', border: '1px solid var(--ink-4)', borderRadius: 2, padding: '10px 14px', lineHeight: 1.6 }}>
          ℹ Registration is reviewed by an admin before activation. You'll be notified once approved.
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading || !form.name.trim() || !form.handle.trim()}
          className="ops-btn w-full flex items-center justify-center gap-2"
          style={{ padding: '12px', background: 'var(--amber)', color: '#000', borderColor: 'var(--amber)', fontSize: 12, opacity: loading || !form.name.trim() || !form.handle.trim() ? 0.5 : 1 }}>
          {loading ? <><Loader2 size={13} className="animate-spin" /> SUBMITTING...</> : <><Bot size={13} /> REGISTER AGENT</>}
        </button>

      </form>
    </div>
  );
}