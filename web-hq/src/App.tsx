import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Costs from './pages/Costs';
import TokenDashboard from './pages/TokenDashboard';
import { ToastContainer, toast } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import NewProject from './pages/NewProject';
import Activity from './pages/Activity';
import Settings from './pages/Settings';
import Chat from './pages/Chat';
import Register from './pages/Register';
import AdminPanel from './pages/AdminPanel';
import Agents from './pages/Agents';
import AgentRegistration from './pages/AgentRegistration';
import AgentDetail from './pages/AgentDetail';
import HQ from './pages/HQ';
import ProjectAssignmentBoard from './pages/ProjectAssignmentBoard';
import { userSession, wsClient } from './services/api';
import { useChatStore } from './store/chatStore';

interface User {
  id: string;
  name: string;
  email?: string;
  avatar_url?: string;
  role?: 'admin' | 'readonly' | 'user';
}

// Role-based route wrapper
function ProtectedRoute({
  children,
  requiredRole,
  user
}: {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'readonly' | 'user';
  user: User | null;
}) {
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-50 mb-2">Access Denied</h2>
          <p className="text-slate-400">You need administrator privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Read-only redirect wrapper
function ReadOnlyRedirect({
  children,
  user
}: {
  children: React.ReactNode;
  user: User | null;
}) {
  if (user?.role === 'readonly') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-50 mb-2">Read-Only Access</h2>
          <p className="text-slate-400">You can view projects but cannot create new ones.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// WebSocket connection manager - connects once at app level
function WebSocketManager({ userId }: { userId?: string }) {
  const { setIsConnected } = useChatStore();

  useEffect(() => {
    // Connect to WebSocket once at app level — do NOT re-run on channel changes
    wsClient.connect([], userId);

    const handleConnected = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    const handleDisconnected = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    wsClient.on('connected', handleConnected);
    wsClient.on('disconnected', handleDisconnected);

    wsClient.on('task:assigned', (data: any) => {
      toast.info('Task Assigned', data?.task?.title ? 'Task: ' + data.task.title : undefined);
    });
    wsClient.on('agent:task_assigned', (data: any) => {
      toast.info('New Task', data?.task?.title ? data.task.title : 'New task assigned to you');
    });
    wsClient.on('task:completed', (data: any) => {
      toast.success('Task Completed', data?.task?.title || undefined);
    });
    wsClient.on('task:rejected', (data: any) => {
      toast.warning('Task Rejected', data?.task?.title || undefined);
    });
    wsClient.on('project:status_changed', (data: any) => {
      toast.info('Project Updated', data?.status ? 'Status: ' + data.status : undefined);
    });

    return () => {
      wsClient.off('connected', handleConnected);
      wsClient.off('disconnected', handleDisconnected);
    };
  }, [userId, setIsConnected]);

  return null;
}

function App() {
  const [user, setUser] = useState<User | null>(userSession.getUser());
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check session on mount
    const storedUser = userSession.getUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsReady(true);
  }, []);

  const handleLogin = () => {
    setUser(userSession.getUser());
  };

  const handleLogout = () => {
    userSession.clearUser();
    setUser(null);
  };

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  // Listen for global API error events and show toast notifications
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        toast.error('API Error', detail.message);
      }
    };
    window.addEventListener('api-error', handler);
    return () => window.removeEventListener('api-error', handler);
  }, []);

  // Not logged in - show auth routes
  if (!user) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <ToastContainer />
          <Routes>
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="/register" element={<Register />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {/* WebSocket manager - persists connection across route changes */}
        <ToastContainer />
        <WebSocketManager userId={user.id} />

      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route
            path="/new-project"
            element={
              <ReadOnlyRedirect user={user}>
                <NewProject />
              </ReadOnlyRedirect>
            }
          />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/tokens" element={<TokenDashboard />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/chat" element={<Chat currentUser={user} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/register" element={<AgentRegistration />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/hq" element={<HQ />} />
          <Route path="/assign" element={<ProjectAssignmentBoard />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute user={user} requiredRole="admin">
                <AdminPanel />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/register" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;