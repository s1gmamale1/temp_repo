import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Bell, Shield, User, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { userSession, authApi, userApi } from '../services/api';

const TABS = [
  { id: 'profile', label: 'PROFILE', icon: User },
  { id: 'notifications', label: 'NOTIFICATIONS', icon: Bell },
  { id: 'security', label: 'SECURITY', icon: Shield },
] as const;
type Tab = typeof TABS[number]['id'];

const M: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ ...M, fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}

function OpsInput({ value, onChange, type = 'text', disabled }: { value: string; onChange?: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <input type={type} value={value} disabled={disabled}
      onChange={e => onChange?.(e.target.value)}
      style={{
        ...M, fontSize: 12, width: '100%', padding: '8px 10px',
        background: 'var(--ink-1)', border: '1px solid var(--ink-4)',
        borderRadius: 3, color: disabled ? 'var(--text-lo)' : 'var(--text-hi)',
        outline: 'none',
      }}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--ink-1)', border: '1px solid var(--ink-4)', borderRadius: 3 }}>
      <span style={{ ...M, fontSize: 11, color: 'var(--text-mid)' }}>{label}</span>
      <button onClick={() => onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
        background: checked ? 'var(--amber)' : 'var(--ink-4)', transition: 'background 150ms',
      }}>
        <span style={{
          position: 'absolute', top: 2, width: 16, height: 16, borderRadius: 8, background: '#fff',
          transition: 'left 150ms', left: checked ? 18 : 2,
        }} />
      </button>
    </div>
  );
}

export default function Settings() {
  const user = userSession.getUser();
  const [tab, setTab] = useState<Tab>('profile');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [notifyTasks, setNotifyTasks] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyAgents, setNotifyAgents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    userApi.getPreferences().then(res => {
      setNotifyTasks(res.preferences.notify_tasks);
      setNotifyMessages(res.preferences.notify_messages);
      setNotifyAgents(res.preferences.notify_agents);
    }).catch(() => {});
  }, []);

  const showStatus = (type: 'ok' | 'err', msg: string) => {
    setStatus({ type, msg });
    setTimeout(() => setStatus(null), 3000);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await userApi.updateProfile({ name, email });
      // Update localStorage with new data too
      const stored = localStorage.getItem('claw_user');
      if (stored) {
        const user = JSON.parse(stored);
        localStorage.setItem('claw_user', JSON.stringify({ ...user, name, email }));
      }
      showStatus('ok', 'Profile updated successfully');
    } catch (err: any) {
      showStatus('err', err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const saveNotifications = async () => {
    setSaving(true);
    try {
      await userApi.updatePreferences({
        notify_tasks: notifyTasks,
        notify_messages: notifyMessages,
        notify_agents: notifyAgents,
      });
      showStatus('ok', 'Notification preferences saved');
    } catch (err: any) {
      showStatus('err', err.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!currentPw) return showStatus('err', 'Enter current password');
    if (newPw.length < 8) return showStatus('err', 'Password must be 8+ chars');
    if (newPw !== confirmPw) return showStatus('err', 'Passwords do not match');
    setSaving(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      showStatus('ok', 'Password changed. Please log in again.');
      // Clear session and redirect to login after a short delay
      setTimeout(() => {
        localStorage.removeItem('claw_token');
        localStorage.removeItem('claw_user');
        window.location.href = '/';
      }, 2000);
    } catch (e: any) {
      showStatus('err', e.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <div className="ops-section-header" style={{ marginBottom: 4 }}>System</div>
        <h1 style={{ ...M, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-hi)' }}>SETTINGS</h1>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Sidebar */}
        <div style={{ width: 160, flexShrink: 0 }}>
          <div className="ops-panel p-0 overflow-hidden">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                width: '100%', padding: '10px 14px', border: 'none',
                borderBottom: '1px solid var(--ink-4)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                background: tab === t.id ? 'var(--amber-glow)' : 'transparent',
                borderLeft: tab === t.id ? '2px solid var(--amber)' : '2px solid transparent',
              }}>
                <t.icon size={12} style={{ color: tab === t.id ? 'var(--amber)' : 'var(--text-lo)' }} />
                <span style={{ ...M, fontSize: 10, color: tab === t.id ? 'var(--amber)' : 'var(--text-lo)', letterSpacing: '0.08em' }}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {status && (
            <div style={{
              ...M, fontSize: 11, padding: '8px 12px', borderRadius: 3, marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8,
              background: status.type === 'ok' ? '#10b98115' : '#ef444415',
              border: `1px solid ${status.type === 'ok' ? '#10b98130' : '#ef444430'}`,
              color: status.type === 'ok' ? '#10b981' : '#ef4444',
            }}>
              {status.type === 'ok' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              {status.msg}
            </div>
          )}

          {tab === 'profile' && (
            <div className="ops-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em', textTransform: 'uppercase', paddingBottom: 10, borderBottom: '1px solid var(--ink-4)' }}>
                User Profile
              </div>
              <Row label="Display Name"><OpsInput value={name} onChange={setName} /></Row>
              <Row label="Email"><OpsInput value={email} onChange={setEmail} type="email" /></Row>
              <Row label="Role"><OpsInput value={user?.role || 'user'} disabled /></Row>
              <Row label="User ID"><OpsInput value={user?.id || '—'} disabled /></Row>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--ink-4)' }}>
                <button onClick={saveProfile} disabled={saving} className="ops-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Save size={11} /> {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="ops-panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em', textTransform: 'uppercase', paddingBottom: 10, borderBottom: '1px solid var(--ink-4)' }}>
                Notification Preferences
              </div>
              <Toggle checked={notifyTasks} onChange={setNotifyTasks} label="Task assignments & updates" />
              <Toggle checked={notifyMessages} onChange={setNotifyMessages} label="New direct messages" />
              <Toggle checked={notifyAgents} onChange={setNotifyAgents} label="Agent status changes" />
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--ink-4)' }}>
                <button onClick={saveNotifications} disabled={saving} className="ops-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Save size={11} /> {saving ? 'Saving...' : 'Save Preferences'}
                </button>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="ops-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ ...M, fontSize: 10, color: 'var(--text-lo)', letterSpacing: '0.1em', textTransform: 'uppercase', paddingBottom: 10, borderBottom: '1px solid var(--ink-4)' }}>
                Change Password
              </div>
              <Row label="Current Password"><OpsInput value={currentPw} onChange={setCurrentPw} type="password" /></Row>
              <Row label="New Password"><OpsInput value={newPw} onChange={setNewPw} type="password" /></Row>
              <Row label="Confirm Password"><OpsInput value={confirmPw} onChange={setConfirmPw} type="password" /></Row>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--ink-4)' }}>
                <button onClick={savePassword} disabled={saving} className="ops-btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Shield size={11} /> {saving ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}