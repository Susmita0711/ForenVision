import React from 'react';
import { Outlet } from 'react-router-dom';
import { Shield } from 'lucide-react';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Background ambient forensic grid & blur */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Brand Header */}
      <div className="mb-6 flex flex-col items-center text-center z-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-emerald-400 p-[1.5px] shadow-xl shadow-cyan-500/20 mb-3">
          <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#0B0F19]">
            <Shield className="h-6 w-6 text-cyan-400" />
          </div>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>ForenVision AI</span>
          <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400 border border-cyan-500/30">
            SECURE ACCESS
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Cryptographic Evidence Validation & Investigation Terminal
        </p>
      </div>

      {/* Form Card Container */}
      <div className="w-full max-w-md z-10">
        <Outlet />
      </div>

      {/* Terminal Compliance Footer */}
      <div className="mt-8 text-center text-[11px] text-slate-500 z-10 space-y-1">
        <p>Restricted Law Enforcement & Digital Forensic Examiner Terminal</p>
        <p className="font-mono text-[10px] text-slate-600">All sessions logged & timestamped under SHA-256 audit ledger</p>
      </div>
    </div>
  );
};
