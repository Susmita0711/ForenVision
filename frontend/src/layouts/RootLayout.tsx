import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Shield, Activity, FileSearch, Database, Terminal } from 'lucide-react';

export const RootLayout: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { label: 'System Overview', path: '/', icon: Activity },
    { label: 'Cases (Upcoming)', path: '#', icon: FileSearch, disabled: true },
    { label: 'Vault (Upcoming)', path: '#', icon: Database, disabled: true },
  ];

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-[1.5px] flex items-center justify-center shadow-lg shadow-cyan-500/10">
            <div className="w-full h-full bg-[#0B0F19] rounded-[10px] flex items-center justify-center">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                ForenVision
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                AI Platform
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Forensic Investigation & Integrity Engine</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  item.disabled
                    ? 'text-slate-600 cursor-not-allowed opacity-60'
                    : isActive
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                onClick={(e) => {
                  if (item.disabled) e.preventDefault();
                }}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span>API Gateway: :5001</span>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0B0F19] px-6 py-4 text-center text-xs text-slate-500">
        ForenVision AI &copy; {new Date().getFullYear()} &mdash; Digital Forensics & Cryptographic Chain-of-Custody Core
      </footer>
    </div>
  );
};
