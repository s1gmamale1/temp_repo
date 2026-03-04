import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Cpu, Loader2 } from 'lucide-react';
import { projectsApi } from '../services/api';

export default function NewProject() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [macMini, setMacMini] = useState('');
  const [form, setForm] = useState({ name: '', description: '', budget: 500 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const STEPS = [{ id: 1, label: 'BASICS' }, { id: 2, label: 'MACHINE' }, { id: 3, label: 'REVIEW' }];
  const MACS = [
    { id: 'mac-mini-1', name: 'Mac Mini #1', status: 'In Use', ok: true },
    { id: 'mac-mini-2', name: 'Mac Mini #2', status: 'Ready', ok: true },
    { id: 'mac-mini-3', name: 'Mac Mini #3', status: 'Offline', ok: false },
  ];

  const set = (k: string, v: string | number) => setForm(p => ({ ...p, [k]: v }));
  const canNext = step === 1 ? form.name.trim().length > 0 : true;

  const submit = async () => {
    try {
      setLoading(true); setError(null);
      await projectsApi.create({ name: form.name, description: form.description, config: { budget: form.budget, macMiniId: macMini || undefined } });
      navigate('/projects');
    } catch (e: any) { setError(e.message || 'Failed to create'); setLoading(false); }
  };

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }} className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/projects" style={{ color: 'var(--text-lo)', display: 'flex', alignItems: 'center' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="ops-section-header" style={{ marginBottom: 2 }}>Core</div>
          <h1 style={{ ...mono, fontSize: 20, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-0.02em' }}>NEW PROJECT</h1>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontSize: 10, fontWeight: 700,
                background: step > s.id ? '#10b981' : step === s.id ? 'var(--amber)' : 'var(--ink-3)',
                color: step >= s.id ? '#000' : 'var(--text-lo)',
                border: `1px solid ${step === s.id ? 'var(--amber)' : step > s.id ? '#10b981' : 'var(--ink-4)'}`
              }}>
                {step > s.id ? <Check size={11} /> : s.id}
              </div>
              <span style={{ ...mono, fontSize: 10, letterSpacing: '0.08em', color: step >= s.id ? 'var(--text-mid)' : 'var(--text-lo)' }}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: 'var(--ink-4)', margin: '0 12px' }} />}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ ...mono, fontSize: 11, color: '#ef4444', background: 'var(--ink-2)', border: '1px solid #7f1d1d', borderRadius: 2, padding: '10px 14px' }}>
          ERR: {error}
        </div>
      )}

      {/* Form */}
      <div className="ops-panel p-6 space-y-5">
        {step === 1 && (<>
          <div className="ops-section-header">Project Basics</div>
          <div>
            <label style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Project Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input type="text" placeholder="e.g., Alpha Scraper" value={form.name} onChange={e => set('name', e.target.value)} className="ops-input" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Description</label>
            <textarea rows={3} placeholder="Brief description..." value={form.description} onChange={e => set('description', e.target.value)}
              className="ops-input" style={{ width: '100%', resize: 'vertical', minHeight: 80 }} />
          </div>
          <div>
            <label style={{ ...mono, fontSize: 10, color: 'var(--text-lo)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>
              Monthly Budget — <span style={{ color: 'var(--amber)' }}>${form.budget}</span>
            </label>
            <input type="range" min="100" max="2000" step="50" value={form.budget} onChange={e => set('budget', parseInt(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--amber)' }} />
            <div className="flex justify-between" style={{ ...mono, fontSize: 9, color: 'var(--text-lo)', marginTop: 4 }}>
              <span>$100</span><span>$2000</span>
            </div>
          </div>
        </>)}

        {step === 2 && (<>
          <div className="ops-section-header">Machine Assignment</div>
          <p style={{ ...mono, fontSize: 11, color: 'var(--text-lo)' }}>Select a Mac Mini or assign later.</p>
          <div className="space-y-2">
            <button onClick={() => setMacMini('')} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: macMini === '' ? 'var(--amber)11' : 'var(--ink-3)', border: `1px solid ${macMini === '' ? 'var(--amber)' : 'var(--ink-4)'}`, borderRadius: 2, cursor: 'pointer', textAlign: 'left' }}>
              <Cpu size={13} style={{ color: 'var(--text-lo)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ ...mono, fontSize: 12, color: 'var(--text-hi)' }}>Auto-assign later</div>
                <div style={{ ...mono, fontSize: 9, color: 'var(--text-lo)' }}>Choose after creation</div>
              </div>
              {macMini === '' && <Check size={12} style={{ color: 'var(--amber)' }} />}
            </button>
            {MACS.map(m => (
              <button key={m.id} onClick={() => m.ok && setMacMini(m.id)} disabled={!m.ok}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: macMini === m.id ? 'var(--amber)11' : 'var(--ink-3)', border: `1px solid ${macMini === m.id ? 'var(--amber)' : 'var(--ink-4)'}`, borderRadius: 2, cursor: m.ok ? 'pointer' : 'not-allowed', opacity: m.ok ? 1 : 0.4, textAlign: 'left' }}>
                <Cpu size={13} style={{ color: 'var(--text-lo)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ ...mono, fontSize: 12, color: 'var(--text-hi)' }}>{m.name}</span>
                </div>
                <span style={{ ...mono, fontSize: 9, color: m.status === 'Ready' ? '#10b981' : m.status === 'In Use' ? '#faa81a' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.status}</span>
                {macMini === m.id && <Check size={12} style={{ color: 'var(--amber)' }} />}
              </button>
            ))}
          </div>
        </>)}

        {step === 3 && (<>
          <div className="ops-section-header">Review</div>
          <table className="ops-table w-full">
            <tbody>
              {[['Name', form.name], ['Description', form.description || '—'], ['Budget', `$${form.budget}/mo`], ['Machine', macMini || 'Auto-assign']].map(([k, v]) => (
                <tr key={String(k)}>
                  <td style={{ color: 'var(--text-lo)', width: '40%' }}>{k}</td>
                  <td style={{ color: 'var(--text-hi)', fontWeight: 600 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ ...mono, fontSize: 10, color: 'var(--text-lo)' }}>Add agents and tasks after creation.</p>
        </>)}

        {/* Nav */}
        <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid var(--ink-4)' }}>
          <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1 || loading}
            style={{ ...mono, fontSize: 11, color: 'var(--text-lo)', background: 'none', border: 'none', cursor: step === 1 ? 'default' : 'pointer', opacity: step === 1 ? 0.4 : 1 }}>
            ← Back
          </button>
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} disabled={!canNext} className="ops-btn" style={{ opacity: canNext ? 1 : 0.4 }}>
              Next →
            </button>
          ) : (
            <button onClick={submit} disabled={loading} className="ops-btn flex items-center gap-1" style={{ background: 'var(--amber)', color: '#000', borderColor: 'var(--amber)', opacity: loading ? 0.6 : 1 }}>
              {loading ? <><Loader2 size={11} className="animate-spin" /> Creating...</> : <><Check size={11} /> Create Project</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}