import { useState } from 'react';
import { Cpu, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi, userSession } from '../services/api';

interface LoginProps {
  onLogin: (user: any) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !password) { setError('Credentials required'); return; }
    try {
      setLoading(true); setError(null);
      const data = await authApi.login({ login, password });
      // Backend returns { session: { token }, user } or { token, user }
      const token = data.token || data.session?.token || data.accessToken;
      if (token) {
        localStorage.setItem('claw_token', token);
        userSession.setUser(data.user);
        onLogin(data.user);
      } else {
        setError('Authentication failed');
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink-1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {/* Grid bg */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--ink-3) 1px, transparent 1px), linear-gradient(90deg, var(--ink-3) 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: 0.3 }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 400, padding: 24 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, background: 'var(--amber-glow)', border: '1px solid var(--amber-line)', borderRadius: 2, marginBottom: 16 }}>
            <Cpu size={22} style={{ color: 'var(--amber)' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--amber)' }}>PROJECT-CLAW</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 4 }}>Secure Access Terminal</div>
        </div>

        {/* Panel */}
        <div className="ops-panel" style={{ padding: 24 }}>
          <div className="ops-section-header" style={{ marginBottom: 20 }}>Authentication Required</div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 2, padding: '8px 12px', marginBottom: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ef4444', letterSpacing: '0.04em' }}>
              ERR: {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Username</label>
              <input
                type="text"
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="Enter identifier..."
                className="ops-input"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter key..."
                  className="ops-input"
                  style={{ paddingRight: 40 }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-lo)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="ops-btn ops-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '10px 16px', fontSize: 12 }}>
              {loading ? <><Loader2 size={13} className="animate-spin" /> AUTHENTICATING...</> : 'AUTHENTICATE'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
          MULTI-AGENT CONTROL SYSTEM // AUTHORIZED ACCESS ONLY
        </div>
      </div>
    </div>
  );
}