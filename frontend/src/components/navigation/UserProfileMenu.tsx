import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, Shield, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const UserProfileMenu: React.FC = () => {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 text-xs font-semibold"
      >
        Sign In
      </button>
    );
  }

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
    navigate('/login');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2.5 rounded-lg border border-slate-700/80 bg-slate-900/90 p-1.5 pr-2.5 hover:border-slate-600 transition-all text-left focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="h-7 w-7 rounded-md object-cover border border-slate-700"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-950 text-cyan-300 font-mono text-xs font-bold border border-cyan-800">
            {getInitials(user.name)}
          </div>
        )}

        <div className="hidden md:block">
          <p className="text-xs font-semibold text-slate-200 leading-none">{user.name}</p>
          <p className="text-[10px] font-mono text-cyan-400 mt-0.5 leading-none">
            {user.badgeNumber} &bull; <span className="capitalize">{user.role.replace(/_/g, ' ')}</span>
          </p>
        </div>

        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl py-1 text-xs text-slate-300 z-50">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/50">
            <p className="font-semibold text-slate-100">{user.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                Badge: {user.badgeNumber}
              </span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <Check className="h-3 w-3" /> Certified
              </span>
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              <span>Investigator Settings</span>
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/users');
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              <Shield className="h-4 w-4 text-slate-400" />
              <span>Clearance & Personnel</span>
            </button>
          </div>

          <div className="border-t border-slate-800 py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-rose-950/30 text-rose-400 hover:text-rose-300 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out of Terminal</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
