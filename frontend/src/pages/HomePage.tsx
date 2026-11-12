import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  Server, 
  Database, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Cpu, 
  Code2, 
  Layers 
} from 'lucide-react';
import { getHealthStatus, getDatabaseHealth } from '../api/healthApi';
import type { HealthResponse, DatabaseHealthResponse } from '../types';

export const HomePage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [dbHealth, setDbHealth] = useState<DatabaseHealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthData, dbData] = await Promise.all([
        getHealthStatus(),
        getDatabaseHealth().catch(() => null),
      ]);
      setHealth(healthData);
      setDbHealth(dbData);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unable to connect to Flask backend.';
      setError(errorMsg);
      setHealth(null);
      setDbHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const getDbBadge = () => {
    if (!health) return null;
    const { status, message, latency_ms } = health.database;
    if (status === 'connected') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Connected ({health.database.name || 'Atlas'}{latency_ms ? ` · ${latency_ms}ms` : ''})
        </span>
      );
    }
    if (status === 'unconfigured') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5" />
          {message || 'Unconfigured (Awaiting MONGODB_URI)'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
        <AlertCircle className="w-3.5 h-3.5" />
        Disconnected
      </span>
    );
  };

  return (
    <div className="space-y-8 py-2">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-[#0F172A] p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <ShieldCheck className="w-3.5 h-3.5" /> System Bootstrap Phase 1
              </span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              ForenVision AI Investigation Engine
            </h1>
            <p className="mt-2 text-sm text-slate-400 max-w-2xl leading-relaxed">
              AI-driven forensic analysis, image forgery detection (ELA), cryptographic SHA-256 chain of custody, and computer vision evidence validation platform.
            </p>
          </div>

          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 text-xs font-semibold border border-slate-700 transition-all shadow-md disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Ping Backend</span>
          </button>
        </div>
      </div>

      {/* Real-Time Health & Services Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Flask API Gateway Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0F172A]/70 p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Flask API Gateway</h3>
                <p className="text-[11px] text-slate-400">RESTful Application Factory</p>
              </div>
            </div>
            {loading ? (
              <span className="text-xs text-slate-500">Checking...</span>
            ) : health ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" /> Offline
              </span>
            )}
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="font-mono text-slate-200">{health?.status || (error ? 'unreachable' : 'pending')}</span>
            </div>
            <div className="flex justify-between">
              <span>App Core:</span>
              <span className="font-mono text-slate-200">{health?.app || 'ForenVision API'}</span>
            </div>
            <div className="flex justify-between">
              <span>Environment:</span>
              <span className="font-mono text-cyan-400">{health?.environment || 'development'}</span>
            </div>
          </div>
        </div>

        {/* MongoDB Database State Card */}
        <div className="rounded-xl border border-slate-800 bg-[#0F172A]/70 p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">MongoDB Atlas</h3>
                <p className="text-[11px] text-slate-400">Evidence & Custody Persistence</p>
              </div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 space-y-2">
            <div className="flex items-center justify-between">
              <span>Connection:</span>
              <div>{getDbBadge()}</div>
            </div>
            {health?.database.status === 'connected' && (
              <div className="space-y-1 font-mono text-[11px] text-slate-300">
                {health.database.masked_uri && (
                  <div className="flex justify-between truncate">
                    <span className="text-slate-500">Cluster:</span>
                    <span className="text-slate-300 truncate max-w-[180px]">{health.database.masked_uri}</span>
                  </div>
                )}
                {dbHealth?.database.indexes_ready && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Indexes:</span>
                    <span>Initialized</span>
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-slate-500 leading-normal">
              Zero-hardcoded-secrets policy active. Provide <code className="text-cyan-400">MONGODB_URI</code> in <code className="text-slate-300">backend/.env</code> to engage live cluster.
            </p>
          </div>
        </div>

        {/* AI & Media Forensics Engine */}
        <div className="rounded-xl border border-slate-800 bg-[#0F172A]/70 p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Forensic Processing</h3>
                <p className="text-[11px] text-slate-400">OpenCV & Hashing Pipeline</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400">
              <Activity className="w-3.5 h-3.5" /> Ready
            </span>
          </div>
          <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Image Engine:</span>
              <span className="font-mono text-slate-200">OpenCV + Pillow</span>
            </div>
            <div className="flex justify-between">
              <span>Integrity:</span>
              <span className="font-mono text-slate-200">SHA-256 Hashing</span>
            </div>
            <div className="flex justify-between">
              <span>Tamper Analysis:</span>
              <span className="font-mono text-emerald-400">Error Level Analysis (ELA)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Verification Overview */}
      <div className="rounded-xl border border-slate-800 bg-[#0F172A]/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-400" />
          <h2 className="text-base font-semibold text-white">System Architecture & Layer Verification</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <Code2 className="w-4 h-4 text-cyan-400" /> Frontend Layer (Active)
            </div>
            <ul className="space-y-1.5 text-slate-400">
              <li>• <strong className="text-slate-300">Framework:</strong> React 18+ with TypeScript & Vite</li>
              <li>• <strong className="text-slate-300">Styling:</strong> Tailwind CSS with customized Forensic Dark Theme</li>
              <li>• <strong className="text-slate-300">Networking:</strong> Reusable Axios Client with bearer token interceptor</li>
              <li>• <strong className="text-slate-300">Routing:</strong> React Router with clean layouts</li>
            </ul>
          </div>

          <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-200">
              <Server className="w-4 h-4 text-emerald-400" /> Backend Layer (Active)
            </div>
            <ul className="space-y-1.5 text-slate-400">
              <li>• <strong className="text-slate-300">Framework:</strong> Python Flask Application Factory (`create_app`)</li>
              <li>• <strong className="text-slate-300">Database Engine:</strong> PyMongo Driver with graceful unconfigured fallback</li>
              <li>• <strong className="text-slate-300">Security:</strong> Zero hardcoded secrets, strict .gitignore coverage</li>
              <li>• <strong className="text-slate-300">Health Endpoint:</strong> <code className="text-cyan-400">GET /api/health</code> operational</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
