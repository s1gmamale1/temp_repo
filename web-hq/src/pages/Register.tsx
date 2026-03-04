import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';
import { Loader2, UserPlus, AlertCircle, Eye, EyeOff, CheckCircle } from 'lucide-react';

type RegistrationType = 'user' | 'agent' | null;

export default function Register() {
  const navigate = useNavigate();
  const [registrationType, setRegistrationType] = useState<RegistrationType>(null);
  
  // User registration form
  const [userForm, setUserForm] = useState({
    login: '',
    password: '',
    confirmPassword: '',
  });
  
  // Agent registration form
  const [agentForm, setAgentForm] = useState({
    name: '',
    role: 'developer',
    description: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(false);

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (userForm.password !== userForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (userForm.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await authApi.register(userForm.login, userForm.password);
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      // Agent registration endpoint
      await authApi.registerAgent({
        name: agentForm.name,
        role: agentForm.role,
        description: agentForm.description,
      });
      setPendingMessage(true);
    } catch (err: any) {
      setError(err.message || 'Agent registration failed');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setRegistrationType(null);
    setUserForm({ login: '', password: '', confirmPassword: '' });
    setAgentForm({ name: '', role: 'developer', description: '' });
    setError(null);
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl text-center">
          <div className="w-16 h-16 bg-success/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-slate-50 mb-2">
            Registration Complete!
          </h1>
          <p className="text-slate-400">
            Your account has been created successfully. Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  if (pendingMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl text-center">
          <div className="w-16 h-16 bg-yellow-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-50 mb-2">
            Pending Approval
          </h1>
          <p className="text-slate-400 mb-4">
            Your agent registration has been submitted and is pending admin approval. You will be notified once approved.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="text-primary hover:text-primary-light underline"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Registration type selection
  if (!registrationType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-slate-50">
              Create Account
            </h1>
            <p className="text-slate-400 mt-2">
              Choose your registration type
            </p>
          </div>

          {/* Options */}
          <div className="space-y-4">
            <button
              onClick={() => setRegistrationType('user')}
              className="w-full p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-primary rounded-xl transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200">User Account</h3>
                  <p className="text-sm text-slate-400">Create a regular user account</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setRegistrationType('agent')}
              className="w-full p-4 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 hover:border-primary rounded-xl transition-all text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-violet-500/20 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-200">Agent Registration</h3>
                  <p className="text-sm text-slate-400">Register as an AI agent (requires approval)</p>
                </div>
              </div>
            </button>
          </div>

          {/* Login link */}
          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-light">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary/20 rounded-xl flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-50">
            {registrationType === 'user' ? 'User Registration' : 'Agent Registration'}
          </h1>
          <button
            onClick={resetForm}
            className="text-sm text-slate-500 hover:text-slate-300 mt-2 underline"
          >
            ← Change registration type
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-danger/10 border border-danger/30 rounded-lg flex items-center gap-2 text-danger text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* User Registration Form */}
        {registrationType === 'user' && (
          <form onSubmit={handleUserSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Login
              </label>
              <input
                type="text"
                value={userForm.login}
                onChange={(e) => setUserForm({ ...userForm, login: e.target.value })}
                placeholder="Choose a username"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-colors"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder="Create a password"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 pr-12 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-colors"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={userForm.confirmPassword}
                  onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                  placeholder="Confirm your password"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 pr-12 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-colors"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !userForm.login.trim() || !userForm.password.trim() || !userForm.confirmPassword.trim()}
              className="w-full bg-primary hover:bg-primary-dark disabled:bg-slate-700 disabled:text-slate-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        )}

        {/* Agent Registration Form */}
        {registrationType === 'agent' && (
          <form onSubmit={handleAgentSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Agent Name
              </label>
              <input
                type="text"
                value={agentForm.name}
                onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                placeholder="e.g., CodeHelper-1"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-colors"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Role
              </label>
              <select
                value={agentForm.role}
                onChange={(e) => setAgentForm({ ...agentForm, role: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 focus:outline-none focus:border-primary transition-colors"
                disabled={loading}
              >
                <option value="developer">Developer</option>
                <option value="reviewer">Code Reviewer</option>
                <option value="tester">Tester</option>
                <option value="documentation">Documentation</option>
                <option value="general">General Assistant</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={agentForm.description}
                onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                placeholder="Describe your capabilities and purpose..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-primary transition-colors resize-none"
                disabled={loading}
              />
            </div>

            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-sm text-yellow-400">
                <strong>Note:</strong> Agent registrations require admin approval before activation.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !agentForm.name.trim()}
              className="w-full bg-primary hover:bg-primary-dark disabled:bg-slate-700 disabled:text-slate-500 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit for Approval'
              )}
            </button>
          </form>
        )}

        {/* Login link */}
        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary-light">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
