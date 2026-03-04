# PROJECT-CLAW Web HQ

A React + TypeScript + Vite dashboard for managing AI agent projects.

## Features

- **Dashboard** - Platform overview with project cards, stats, and recent activity
- **Projects** - List and manage all agent projects with status, budgets, and resources
- **Project Detail** - Deep dive into individual projects with workers, tasks, and resource usage
- **Tasks** - Kanban board view for task management across projects
- **Costs** - Cost analytics with charts (Recharts) for budget tracking
- **New Project Wizard** - 4-step flow to create new agent projects

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** - Fast dev server and building
- **Tailwind CSS** - Dark theme (slate-900 bg, indigo-500 primary)
- **React Router** - Client-side navigation
- **Recharts** - Data visualization
- **Lucide React** - Icons

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
web-hq/
├── src/
│   ├── components/
│   │   └── Layout.tsx          # Sidebar + main layout
│   ├── pages/
│   │   ├── Dashboard.tsx       # Main dashboard
│   │   ├── Projects.tsx        # Projects list
│   │   ├── ProjectDetail.tsx   # Single project view
│   │   ├── Tasks.tsx           # Kanban task board
│   │   ├── Costs.tsx           # Cost analytics with charts
│   │   ├── NewProject.tsx      # 4-step project wizard
│   │   ├── Activity.tsx        # Activity log
│   │   └── Settings.tsx        # Platform settings
│   ├── data/
│   │   └── mockData.ts         # Mock data for 3 projects
│   ├── App.tsx                 # Routes
│   └── main.tsx                # Entry point
├── index.html
├── tailwind.config.js
└── package.json
```

## Mock Data

The app includes mock data for 3 projects:

1. **SaaS API Tool** - Active project with tasks
2. **Notion→Video** - Content project in standby
3. **CS Farm** - Custom project offline

## Design System

**Colors:**
- Background: slate-900 (#0f172a)
- Card BG: slate-800 (#1e293b)
- Primary: indigo-500 (#6366f1)
- Success: green-500 (#22c55e)
- Warning: amber-500 (#f59e0b)
- Danger: red-500 (#ef4444)

**Project Type Colors:**
- SaaS: violet-500
- Content: pink-500
- E-commerce: orange-500
- Custom: cyan-500

## Development

The dev server runs on http://localhost:5173 by default.

Hot module replacement is enabled - changes refresh instantly.
