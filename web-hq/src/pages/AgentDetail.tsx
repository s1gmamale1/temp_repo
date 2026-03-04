import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentsApi } from '../services/api';
import type { Agent } from '../services/api';
import { 
  Bot, 
  Loader2, 
  AlertCircle, 
  ArrowLeft,
  MessageSquare,
  Calendar,
  Mail,
  Award,
  Sparkles
} from 'lucide-react';

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchAgent(id);
    }
  }, [id]);

  const fetchAgent = async (agentId: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await agentsApi.getById(agentId);
      setAgent(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-500';
      case 'working':
        return 'bg-blue-500';
      case 'idle':
        return 'bg-yellow-500';
      case 'offline':
        return 'bg-slate-500';
      // Legacy status support
      case 'approved':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'rejected':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Task Lead':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'Developer':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'Researcher':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'Designer':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
      case 'QA':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'DevOps':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        <span className="ml-3 text-slate-400">Loading agent profile...</span>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        {error || 'Agent not found'}
        <button 
          onClick={() => navigate('/agents')}
          className="ml-auto text-sm underline hover:no-underline"
        >
          Back to Agents
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <button
        onClick={() => navigate('/agents')}
        className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Agents
      </button>

      {/* Profile Header */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-indigo-600 to-purple-600" />
        
        <div className="px-6 pb-6">
          <div className="relative flex flex-col sm:flex-row sm:items-end -mt-12 mb-4 gap-4">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center border-4 border-slate-800 shadow-xl">
                {agent.avatar_url ? (
                  <img 
                    src={agent.avatar_url} 
                    alt={agent.name}
                    className="w-24 h-24 rounded-2xl object-cover"
                  />
                ) : (
                  <Bot className="w-12 h-12 text-white" />
                )}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-6 h-6 ${getStatusColor(agent.status)} rounded-full border-4 border-slate-800`} />
              <div className="absolute -top-1 -left-1 w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center border-2 border-slate-800">
                <span className="text-xs">🤖</span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 sm:mb-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-100">{agent.name}</h1>
                <span className="text-slate-500">{agent.handle}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${getRoleBadgeColor(agent.role)}`}>
                  {agent.role}
                </span>
                <span className={`px-2 py-1 rounded-full text-xs capitalize ${
                  agent.status === 'online' || agent.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                  agent.status === 'working' ? 'bg-blue-500/20 text-blue-400' :
                  agent.status === 'idle' || agent.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>
                  {agent.status}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/chat?agent=${agent.id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                Message
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* About */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            About
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-sm text-slate-500">Experience Level</p>
                <p className="text-slate-200 font-medium">{agent.experience_level}</p>
              </div>
            </div>

            {agent.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-500" />
                <div>
                  <p className="text-sm text-slate-500">Email</p>
                  <p className="text-slate-200 font-medium">{agent.email}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-slate-500" />
              <div>
                <p className="text-sm text-slate-500">Joined</p>
                <p className="text-slate-200 font-medium">
                  {new Date(agent.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" />
            Skills
          </h2>
          
          {agent.skills && agent.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {agent.skills.map((skill, idx) => (
                <span 
                  key={idx}
                  className="px-3 py-1.5 bg-slate-700/50 text-slate-300 text-sm rounded-lg"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">No skills listed</p>
          )}
        </div>

        {/* Specialties */}
        {agent.specialties && agent.specialties.length > 0 && (
          <div className="md:col-span-2 bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-200 mb-4">Specialties</h2>
            <div className="flex flex-wrap gap-2">
              {agent.specialties.map((specialty, idx) => (
                <span 
                  key={idx}
                  className="px-3 py-1.5 bg-slate-700/50 text-slate-300 text-sm rounded-lg"
                >
                  {specialty}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
