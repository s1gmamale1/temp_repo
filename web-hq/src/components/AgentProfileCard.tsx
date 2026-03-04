import { useNavigate } from 'react-router-dom';
import { Bot, MessageSquare, UserPlus, Shield } from 'lucide-react';
import type { Agent } from '../services/api';

interface AgentProfileCardProps {
  agent: Agent;
  isAdmin?: boolean;
  onMessage?: (agentId: string) => void;
  onAssign?: (agentId: string) => void;
  compact?: boolean;
}

export default function AgentProfileCard({ 
  agent, 
  isAdmin = false, 
  onMessage, 
  onAssign,
  compact = false 
}: AgentProfileCardProps) {
  const navigate = useNavigate();
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

  const getExperienceBadge = (exp: string) => {
    switch (exp) {
      case 'Expert':
        return '★★★★';
      case 'Senior':
        return '★★★☆';
      case 'Mid':
        return '★★☆☆';
      case 'Junior':
        return '★☆☆☆';
      default:
        return '★☆☆☆';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
        {/* Avatar */}
        <div className="relative">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center">
            {agent.avatar_url ? (
              <img 
                src={agent.avatar_url} 
                alt={agent.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <Bot className="w-5 h-5 text-white" />
            )}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getStatusColor(agent.status)} rounded-full border-2 border-slate-800`} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-200 truncate">{agent.name}</span>
            <span className="text-xs text-slate-500">{agent.handle}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-1.5 py-0.5 rounded border ${getRoleBadgeColor(agent.role)}`}>
              {agent.role}
            </span>
            <span className="text-yellow-500">{getExperienceBadge(agent.experience_level)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {onMessage && (
            <button
              onClick={() => onMessage(agent.id)}
              className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
              title="Send Message"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden hover:border-slate-600 transition-all duration-200">
      {/* Header */}
      <div 
        className="p-6 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => navigate(`/agents/${agent.id}`)}
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              {agent.avatar_url ? (
                <img 
                  src={agent.avatar_url} 
                  alt={agent.name}
                  className="w-16 h-16 rounded-xl object-cover"
                />
              ) : (
                <Bot className="w-8 h-8 text-white" />
              )}
            </div>
            {/* Status Indicator */}
            <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${getStatusColor(agent.status)} rounded-full border-3 border-slate-800 flex items-center justify-center`}>
              <span className="text-[8px] text-white font-bold">
                {agent.status === 'online' || agent.status === 'approved' ? '✓' : 
                 agent.status === 'idle' || agent.status === 'pending' ? '?' : '✗'}
              </span>
            </div>
            {/* Bot Badge */}
            <div className="absolute -top-1 -left-1 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center border-2 border-slate-800">
              <span className="text-xs">🤖</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold text-slate-100">{agent.name}</h3>
              <span className="text-slate-500 text-sm">{agent.handle}</span>
              {isAdmin && (
                <span className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded-full border border-indigo-500/30">
                  <Shield className="w-3 h-3" />
                  Admin
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`px-2.5 py-1 rounded-lg text-sm font-medium border ${getRoleBadgeColor(agent.role)}`}>
                {agent.role}
              </span>
              <span className="text-yellow-500 text-sm" title={`${agent.experience_level} Level`}>
                {getExperienceBadge(agent.experience_level)}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${
                agent.status === 'online' || agent.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                agent.status === 'working' ? 'bg-blue-500/20 text-blue-400' :
                agent.status === 'idle' || agent.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {agent.status}
              </span>
            </div>
          </div>
        </div>

        {/* Skills */}
        {agent.skills && agent.skills.length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-1.5">
              {agent.skills.slice(0, 6).map((skill, idx) => (
                <span 
                  key={idx}
                  className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded-md"
                >
                  {skill}
                </span>
              ))}
              {agent.skills.length > 6 && (
                <span className="px-2 py-1 bg-slate-700/30 text-slate-500 text-xs rounded-md">
                  +{agent.skills.length - 6} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Specialties */}
        {agent.specialties && agent.specialties.length > 0 && (
          <div className="mt-3">
            <p className="text-sm text-slate-400 line-clamp-2">{agent.specialties.join(', ')}</p>
          </div>
        )}

        {/* Contact */}
        {agent.email && (
          <div className="mt-3 text-sm text-slate-500">
            {agent.email}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-slate-800/50 border-t border-slate-700 flex items-center gap-3">
        {onMessage && (
          <button
            onClick={() => onMessage(agent.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <MessageSquare className="w-4 h-4" />
            Message
          </button>
        )}
        
        {isAdmin && onAssign && (
          <button
            onClick={() => onAssign(agent.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Assign to Project
          </button>
        )}
      </div>
    </div>
  );
}
