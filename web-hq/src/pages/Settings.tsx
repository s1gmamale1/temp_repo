import { Settings as SettingsIcon, Bell, Shield, Database, Users } from 'lucide-react';

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-50">Settings</h1>
        <p className="text-slate-400">Manage platform settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="space-y-2">
          {[
            { id: 'general', label: 'General', icon: SettingsIcon },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'security', label: 'Security', icon: Shield },
            { id: 'integrations', label: 'Integrations', icon: Database },
            { id: 'team', label: 'Team', icon: Users },
          ].map((item, i) => (
            <button
              key={item.id}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                i === 0 ? 'bg-primary/20 text-primary' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">General Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Platform Name</label>
                <input
                  type="text"
                  defaultValue="PROJECT-CLAW"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Default Budget Limit</label>
                <input
                  type="number"
                  defaultValue="1000"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-slate-200 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-200">Dark Mode</p>
                  <p className="text-sm text-slate-400">Always use dark theme</p>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-200">Auto-save</p>
                  <p className="text-sm text-slate-400">Automatically save changes</p>
                </div>
                <div className="w-12 h-6 bg-slate-600 rounded-full relative">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-50 mb-4">Danger Zone</h2>
            <div className="space-y-3">
              <button className="w-full p-4 border border-danger/50 text-danger rounded-lg hover:bg-danger/10 transition-colors text-left">
                <p className="font-medium">Reset All Data</p>
                <p className="text-sm opacity-80">This action cannot be undone</p>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
