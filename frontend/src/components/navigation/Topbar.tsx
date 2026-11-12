import React from 'react';
import { Menu, ShieldCheck, Search } from 'lucide-react';
import { NotificationsPopover } from './NotificationsPopover';
import { UserProfileMenu } from './UserProfileMenu';

interface TopbarProps {
  onToggleMobileMenu: () => void;
  onOpenQuickSearch?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  onToggleMobileMenu,
  onOpenQuickSearch,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-800/90 bg-[#0B0F19]/90 px-4 backdrop-blur-md sm:px-6">
      {/* Left Area: Mobile Menu Toggle & System Indicator */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          type="button"
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Open mobile navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Forensic Ledger Security Indicator */}
        <div className="hidden sm:flex items-center gap-2 rounded-full bg-slate-900/90 border border-slate-800 px-3 py-1">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[11px] font-medium text-slate-300">
            Chain of Custody Ledger: <span className="text-emerald-400">Synchronized</span>
          </span>
          <span className="text-slate-600">|</span>
          <span className="font-mono text-[10px] text-cyan-400">SHA-256 Validated</span>
        </div>
      </div>

      {/* Center/Search Quick Look-Up Bar */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div
          onClick={onOpenQuickSearch}
          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-700 hover:bg-slate-900 cursor-pointer transition-colors"
        >
          <Search className="h-3.5 w-3.5 text-slate-500" />
          <span className="flex-1">Search evidence, cases, SHA-256 hashes...</span>
          <kbd className="hidden sm:inline-block rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 border border-slate-700">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Area: System Badge, Notifications & User Profile */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/30 border border-cyan-800/40 text-[11px] text-cyan-300 font-mono">
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
          <span>ISO/IEC 27037 Compliant</span>
        </div>

        <NotificationsPopover />
        <div className="h-5 w-[1px] bg-slate-800 hidden sm:block" />
        <UserProfileMenu />
      </div>
    </header>
  );
};
