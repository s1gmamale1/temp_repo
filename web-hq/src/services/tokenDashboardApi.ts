// API Service - Token Dashboard Extension
import { fetchApi } from './api';

// Token Dashboard API
export const tokenDashboardApi = {
  // Get full token dashboard
  getDashboard: () => fetchApi('/api/tokens/dashboard'),
  
  // Get individual provider usage
  getProvider: (provider: 'kimi' | 'openai' | 'anthropic') => 
    fetchApi(`/api/tokens/providers/${provider}`),
  
  // Get context token stats
  getContextStats: (params?: { project_id?: string; from?: string; to?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi(`/api/tokens/context${query ? `?${query}` : ''}`);
  },
  
  // Get provider API status
  getStatus: () => fetchApi('/api/tokens/status'),
  
  // Record token usage
  recordUsage: (data: {
    project_id?: string;
    user_id?: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    cost_usd?: number;
  }) => fetchApi('/api/tokens/record', { method: 'POST', body: JSON.stringify(data) }),
};

// Provider colors matching backend
export const PROVIDER_COLORS = {
  kimi: '#10b981',      // Green
  openai: '#6366f1',    // Indigo  
  anthropic: '#f59e0b', // Amber
  default: '#64748b',
};

// Provider icons/names
export const PROVIDER_INFO = {
  kimi: {
    name: 'Kimi (Moonshot)',
    shortName: 'Kimi',
    contextWindow: 128000,
    currency: 'CNY'
  },
  openai: {
    name: 'OpenAI',
    shortName: 'OpenAI',
    contextWindow: 128000,
    currency: 'USD'
  },
  anthropic: {
    name: 'Claude (Anthropic)',
    shortName: 'Claude',
    contextWindow: 200000,
    currency: 'USD'
  }
};

// Token usage formatter
export function formatTokenCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

// Currency formatter
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency === 'CNY' ? 'CNY' : 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

// Percentage formatter with color indication
export function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'text-red-500';
  if (percentage >= 80) return 'text-yellow-500';
  if (percentage >= 50) return 'text-blue-500';
  return 'text-green-500';
}

export function getUsageBgColor(percentage: number): string {
  if (percentage >= 90) return 'bg-red-500';
  if (percentage >= 80) return 'bg-yellow-500';
  if (percentage >= 50) return 'bg-blue-500';
  return 'bg-green-500';
}
