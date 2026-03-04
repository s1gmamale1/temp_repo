// Mock data for PROJECT-CLAW Web HQ

export interface Project {
  id: string;
  name: string;
  type: 'saas' | 'content' | 'ecom' | 'custom';
  status: 'active' | 'standby' | 'offline' | 'setup';
  macMiniId: string;
  stats: {
    activeTasks: number;
    totalTasks: number;
    todayCost: number;
    monthCost: number;
    monthBudget: number;
  };
  lastActivity?: string;
  pmName?: string | null;
}

export interface Task {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  status: 'backlog' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  estimatedCost?: number;
  actualCost: number;
}

export interface CostData {
  monthTotal: number;
  monthBudget: number;
  byProject: { name: string; cost: number; percentage: number; color: string }[];
  byModel: { name: string; cost: number; percentage: number }[];
  dailySpend: { day: string; amount: number }[];
}

export const projects: Project[] = [
  {
    id: 'saas-api',
    name: 'SaaS API Tool',
    type: 'saas',
    status: 'active',
    macMiniId: 'mac-mini-1',
    pmName: 'PM-Alpha',
    stats: {
      activeTasks: 3,
      totalTasks: 5,
      todayCost: 4.20,
      monthCost: 89,
      monthBudget: 300,
    },
    lastActivity: '2m ago',
  },
  {
    id: 'notion-video',
    name: 'Notion→Video',
    type: 'content',
    status: 'standby',
    macMiniId: 'mac-mini-2',
    pmName: 'PM-Beta',
    stats: {
      activeTasks: 0,
      totalTasks: 0,
      todayCost: 0,
      monthCost: 45,
      monthBudget: 200,
    },
    lastActivity: '2d ago',
  },
  {
    id: 'cs-farm',
    name: 'CS Farm',
    type: 'custom',
    status: 'offline',
    macMiniId: 'mac-mini-3',
    pmName: null,
    stats: {
      activeTasks: 0,
      totalTasks: 0,
      todayCost: 0,
      monthCost: 0,
      monthBudget: 150,
    },
    lastActivity: '7d ago',
  },
];

export const tasks: Task[] = [
  {
    id: 'T-121',
    title: 'Webhook integration',
    projectId: 'saas-api',
    projectName: 'SaaS API',
    projectColor: '#8b5cf6',
    status: 'in_progress',
    priority: 'high',
    assignee: 'CodeDev-1',
    actualCost: 1.20,
  },
  {
    id: 'T-122',
    title: 'API documentation',
    projectId: 'saas-api',
    projectName: 'SaaS API',
    projectColor: '#8b5cf6',
    status: 'in_progress',
    priority: 'medium',
    assignee: 'CodeReview-1',
    actualCost: 0.80,
  },
  {
    id: 'T-124',
    title: 'Auth middleware',
    projectId: 'saas-api',
    projectName: 'SaaS API',
    projectColor: '#8b5cf6',
    status: 'review',
    priority: 'high',
    assignee: 'CodeDev-1',
    actualCost: 2.20,
  },
  {
    id: 'T-120',
    title: 'Deploy hotfix',
    projectId: 'saas-api',
    projectName: 'SaaS API',
    projectColor: '#8b5cf6',
    status: 'done',
    priority: 'urgent',
    assignee: 'CodeDev-1',
    actualCost: 1.50,
  },
  {
    id: 'T-125',
    title: 'Stripe integration',
    projectId: 'saas-api',
    projectName: 'SaaS API',
    projectColor: '#8b5cf6',
    status: 'backlog',
    priority: 'high',
    estimatedCost: 3.00,
    actualCost: 0,
  },
];

export const costData: CostData = {
  monthTotal: 340,
  monthBudget: 1000,
  byProject: [
    { name: 'SaaS API', cost: 89, percentage: 26, color: '#8b5cf6' },
    { name: 'Notion→Video', cost: 45, percentage: 13, color: '#ec4899' },
    { name: 'CS Farm', cost: 0, percentage: 0, color: '#06b6d4' },
    { name: 'Other', cost: 205, percentage: 60, color: '#64748b' },
  ],
  byModel: [
    { name: 'Kimi K2.5', cost: 210, percentage: 62 },
    { name: 'Kimi K2-T', cost: 95, percentage: 28 },
    { name: 'GPT-5.1', cost: 35, percentage: 10 },
  ],
  dailySpend: [
    { day: 'Feb 1', amount: 12 },
    { day: 'Feb 2', amount: 8 },
    { day: 'Feb 3', amount: 15 },
    { day: 'Feb 4', amount: 9 },
    { day: 'Feb 5', amount: 20 },
    { day: 'Feb 6', amount: 11 },
    { day: 'Feb 7', amount: 14 },
    { day: 'Feb 8', amount: 7 },
    { day: 'Feb 9', amount: 18 },
    { day: 'Feb 10', amount: 13 },
    { day: 'Feb 11', amount: 16 },
    { day: 'Feb 12', amount: 10 },
    { day: 'Feb 13', amount: 22 },
    { day: 'Feb 14', amount: 8 },
    { day: 'Feb 15', amount: 15 },
    { day: 'Feb 16', amount: 12 },
    { day: 'Feb 17', amount: 19 },
    { day: 'Feb 18', amount: 6 },
    { day: 'Feb 19', amount: 14 },
    { day: 'Feb 20', amount: 11 },
    { day: 'Feb 21', amount: 17 },
    { day: 'Feb 22', amount: 9 },
    { day: 'Feb 23', amount: 13 },
    { day: 'Feb 24', amount: 21 },
    { day: 'Feb 25', amount: 10 },
    { day: 'Feb 26', amount: 16 },
    { day: 'Feb 27', amount: 18 },
  ],
};

export const platformStats = {
  macMinis: 6,
  activeProjects: 4,
  totalTasks: 12,
  monthlyCost: 340,
  monthlyBudget: 1000,
};

export const recentActivity = [
  { id: 1, action: 'Task completed', target: 'T-120 Deploy hotfix', time: '2h ago', project: 'SaaS API' },
  { id: 2, action: 'Worker spawned', target: 'CodeReview-1', time: '45m ago', project: 'SaaS API' },
  { id: 3, action: 'Cost alert', target: 'Ecom project at 82% budget', time: '3h ago', project: 'Ecom' },
  { id: 4, action: 'Task started', target: 'T-121 Webhook integration', time: '45m ago', project: 'SaaS API' },
];

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
    case 'done':
      return 'text-success';
    case 'standby':
    case 'in_progress':
    case 'review':
      return 'text-warning';
    case 'offline':
    case 'backlog':
      return 'text-danger';
    default:
      return 'text-slate-400';
  }
};

export const getStatusBg = (status: string) => {
  switch (status) {
    case 'active':
    case 'done':
      return 'bg-success/20 text-success';
    case 'standby':
    case 'in_progress':
    case 'review':
      return 'bg-warning/20 text-warning';
    case 'offline':
    case 'backlog':
      return 'bg-danger/20 text-danger';
    default:
      return 'bg-slate-700 text-slate-400';
  }
};

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent':
      return 'text-danger';
    case 'high':
      return 'text-orange-500';
    case 'medium':
      return 'text-warning';
    default:
      return 'text-slate-400';
  }
};

export const getProjectTypeColor = (type: string) => {
  switch (type) {
    case 'saas':
      return 'text-saas';
    case 'content':
      return 'text-content';
    case 'ecom':
      return 'text-ecom';
    case 'custom':
      return 'text-custom';
    default:
      return 'text-slate-400';
  }
};

export const getProjectTypeBg = (type: string) => {
  switch (type) {
    case 'saas':
      return 'bg-saas/20 text-saas';
    case 'content':
      return 'bg-content/20 text-content';
    case 'ecom':
      return 'bg-ecom/20 text-ecom';
    case 'custom':
      return 'bg-custom/20 text-custom';
    default:
      return 'bg-slate-700 text-slate-400';
  }
};

// Chat types and mock data
export type PrivilegeLevel = 'Admin' | 'Write' | 'Read';

export interface Agent {
  id: string;
  name: string;
  role: string;
  privilege: PrivilegeLevel;
  avatar: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  currentTask?: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  content: string;
  timestamp: string;
  channelId: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'general' | 'project';
  projectId?: string;
  unreadCount?: number;
}

export const agents: Agent[] = [
  {
    id: 'leo',
    name: 'Leonardo',
    role: 'Architect',
    privilege: 'Admin',
    avatar: '/avatars/leonardo.png',
    status: 'online',
    currentTask: 'Reviewing system design',
  },
  {
    id: 'donnie',
    name: 'Donatello',
    role: 'Tech Lead',
    privilege: 'Admin',
    avatar: '/avatars/donatello.png',
    status: 'busy',
    currentTask: 'Optimizing database queries',
  },
  {
    id: 'raph',
    name: 'Raphael',
    role: 'DevOps',
    privilege: 'Write',
    avatar: '/avatars/raphael.png',
    status: 'online',
    currentTask: 'Deploying to production',
  },
  {
    id: 'mikey',
    name: 'Michelangelo',
    role: 'Frontend Lead',
    privilege: 'Write',
    avatar: '/avatars/michelangelo.png',
    status: 'online',
    currentTask: 'Building chat UI',
  },
  {
    id: 'splinter',
    name: 'Splinter',
    role: 'PM',
    privilege: 'Admin',
    avatar: '/avatars/splinter.svg',
    status: 'away',
    currentTask: 'Sprint planning',
  },
  {
    id: 'april',
    name: 'April',
    role: 'QA Lead',
    privilege: 'Write',
    avatar: '/avatars/april.svg',
    status: 'online',
    currentTask: 'Running test suite',
  },
  {
    id: 'casey',
    name: 'Casey',
    role: 'Security',
    privilege: 'Read',
    avatar: '/avatars/casey.svg',
    status: 'offline',
    currentTask: 'Security audit',
  },
];

export const chatChannels: ChatChannel[] = [
  { id: 'general', name: 'general', type: 'general' },
  { id: 'notion-video', name: 'notion→video', type: 'project', projectId: 'notion-video', unreadCount: 3 },
  { id: 'cs-farm', name: 'cs-farm', type: 'project', projectId: 'cs-farm' },
  { id: 'saas-api', name: 'saas-api', type: 'project', projectId: 'saas-api', unreadCount: 1 },
  { id: 'ops', name: 'ops-alerts', type: 'general', unreadCount: 5 },
];

export const chatMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    agentId: 'leo',
    content: 'Good morning team! Just pushed the new architecture docs. Let me know if anyone has questions.',
    timestamp: '2026-02-27T09:15:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-2',
    agentId: 'donnie',
    content: 'Morning! I\'ll review them after I finish the DB optimization. Query time is down 40%! 🚀',
    timestamp: '2026-02-27T09:22:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-3',
    agentId: 'raph',
    content: 'Production deployment is scheduled for 2PM. All systems green.',
    timestamp: '2026-02-27T09:30:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-4',
    agentId: 'mikey',
    content: 'Chat feature is coming along nicely! Should have it ready for demo by EOD 🎨',
    timestamp: '2026-02-27T09:45:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-5',
    agentId: 'april',
    content: 'Found a critical bug in the auth flow. Creating ticket now.',
    timestamp: '2026-02-27T10:05:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-6',
    agentId: 'leo',
    content: 'Thanks April. Raph - can you hold the deployment until we patch this?',
    timestamp: '2026-02-27T10:08:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-7',
    agentId: 'raph',
    content: 'Copy that. Deployment on hold pending auth fix.',
    timestamp: '2026-02-27T10:10:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-8',
    agentId: 'splinter',
    content: 'Remember team - we have sprint review at 4PM today. Be prepared to demo your work.',
    timestamp: '2026-02-27T10:30:00Z',
    channelId: 'general',
  },
  {
    id: 'msg-9',
    agentId: 'mikey',
    content: 'The video rendering pipeline is working! First batch processing now.',
    timestamp: '2026-02-27T11:15:00Z',
    channelId: 'notion-video',
  },
  {
    id: 'msg-10',
    agentId: 'donnie',
    content: 'Storage usage is climbing - we might need to scale up the S3 bucket.',
    timestamp: '2026-02-27T11:20:00Z',
    channelId: 'notion-video',
  },
  {
    id: 'msg-11',
    agentId: 'leo',
    content: 'CS Farm metrics are looking good. 12 agents active, cost is within budget.',
    timestamp: '2026-02-27T08:45:00Z',
    channelId: 'cs-farm',
  },
  {
    id: 'msg-12',
    agentId: 'raph',
    content: 'Auto-scaling is configured for peak hours.',
    timestamp: '2026-02-27T08:50:00Z',
    channelId: 'cs-farm',
  },
];

export const getAgentById = (id: string): Agent | undefined => agents.find(a => a.id === id);

export const getPrivilegeColor = (privilege: PrivilegeLevel): string => {
  switch (privilege) {
    case 'Admin':
      return 'text-red-400 bg-red-400/10';
    case 'Write':
      return 'text-green-400 bg-green-400/10';
    case 'Read':
      return 'text-blue-400 bg-blue-400/10';
    default:
      return 'text-slate-400 bg-slate-400/10';
  }
};
