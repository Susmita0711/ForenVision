import React, { useEffect, useState } from 'react';
import {
  Shield,
  Server,
  Check,
  Save,
  AlertCircle,
  Lock,
  Loader2,
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { useAuth } from '../context/AuthContext';
import {
  fetchSettingsApi,
  updateSettingsApi,
  updateProfileBackendApi,
  type ForensicSettings,
} from '../api/settingsApi';

const DEFAULT_SETTINGS: ForensicSettings = {
  autoVerifyHashes: true,
  highContrastOverlay: false,
  maxUploadSizeMb: 25,
  retentionPolicyDays: 365,
  strictCustodyChain: true,
  requireTwoExaminerSignoff: false,
  auditTrailRetentionDays: 730,
  sessionTimeoutMinutes: 30,
  enforceStrictMfa: false,
};

export const SettingsPage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'admin' || (user?.role || '').toLowerCase() === 'administrator';

  const [name, setName] = useState(user?.name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [settings, setSettings] = useState<ForensicSettings>(DEFAULT_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const [savedNotification, setSavedNotification] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setDepartment(user.department || '');
    }
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingSettings(true);
    fetchSettingsApi()
      .then((data) => setSettings((prev) => ({ ...prev, ...data })))
      .catch((err) => {
        console.warn('Could not load backend settings:', err);
      })
      .finally(() => setLoadingSettings(false));
  }, [isAdmin]);

  const showToast = (msg: string) => {
    setSavedNotification(msg);
    setTimeout(() => setSavedNotification(null), 3500);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    try {
      await updateProfileBackendApi({ name, department });
      updateProfile({ name, department });
      showToast('Examiner identity profile synchronized with backend.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update examiner profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSystemSettings = async () => {
    if (!isAdmin) return;
    setSavingSystem(true);
    setError(null);
    try {
      const updated = await updateSettingsApi(settings);
      setSettings((prev) => ({ ...prev, ...updated }));
      showToast('System forensic policies saved and logged to security audit trail.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save system settings.');
    } finally {
      setSavingSystem(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumbs
        items={[{ label: 'Administration' }, { label: 'Settings' }]}
        title="Terminal & Forensic Security Settings"
        description="Configure cryptographic integrity policies, retention rules, and examiner workstation preferences."
      />

      {savedNotification && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
          <Check className="h-4 w-4 text-emerald-400" />
          <span>{savedNotification}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Profile & Badge Card */}
      <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-400" />
            <span>Examiner Identity & Badge Details</span>
          </h3>
          <span className="font-mono text-xs text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800">
            Badge: {user?.badgeNumber || user?.badge_number || 'N/A'}
          </span>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Examiner Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95 disabled:opacity-50"
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{savingProfile ? 'Saving...' : 'Save Examiner Profile'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* System Governance Policies (Admin Only) */}
      <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Server className="h-4 w-4 text-emerald-400" />
            <span>Global Forensic Governance & Vault Policies</span>
          </h3>
          {!isAdmin && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-300 bg-amber-950/30 border border-amber-500/30 px-2 py-0.5 rounded">
              <Lock className="h-3 w-3" /> Administrator Only
            </span>
          )}
        </div>

        {loadingSettings ? (
          <div className="py-6 flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            <span>Loading system governance configuration...</span>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Max Upload Size (MB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={250}
                  disabled={!isAdmin}
                  value={settings.maxUploadSizeMb}
                  onChange={(e) => setSettings({ ...settings, maxUploadSizeMb: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 font-mono text-xs text-cyan-300 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Evidence Retention (Days)
                </label>
                <input
                  type="number"
                  min={30}
                  max={3650}
                  disabled={!isAdmin}
                  value={settings.retentionPolicyDays}
                  onChange={(e) => setSettings({ ...settings, retentionPolicyDays: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 font-mono text-xs text-cyan-300 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Session Timeout (Minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  disabled={!isAdmin}
                  value={settings.sessionTimeoutMinutes}
                  onChange={(e) => setSettings({ ...settings, sessionTimeoutMinutes: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 px-3 font-mono text-xs text-cyan-300 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={settings.autoVerifyHashes}
                  onChange={(e) => setSettings({ ...settings, autoVerifyHashes: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="font-semibold text-slate-200">Continuous SHA-256 Baseline Verification</span>
                  <p className="text-[11px] text-slate-500">Automatically recalculate cryptographic digest on artifact inspection.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={settings.strictCustodyChain}
                  onChange={(e) => setSettings({ ...settings, strictCustodyChain: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="font-semibold text-slate-200">Enforce Strict Chain-of-Custody Block Linkage</span>
                  <p className="text-[11px] text-slate-500">Require uninterrupted genesis-to-present SHA-256 chain validation.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={settings.requireTwoExaminerSignoff}
                  onChange={(e) => setSettings({ ...settings, requireTwoExaminerSignoff: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="font-semibold text-slate-200">Require Dual-Examiner ACE-V Sign-Off</span>
                  <p className="text-[11px] text-slate-500">Mandate peer verification before sealing courtroom exhibit dossiers.</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={settings.highContrastOverlay}
                  onChange={(e) => setSettings({ ...settings, highContrastOverlay: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                />
                <div>
                  <span className="font-semibold text-slate-200">High-Contrast Forensic Lightbox Default</span>
                  <p className="text-[11px] text-slate-500">Enable high-contrast overlay rendering for ELA and detection previews.</p>
                </div>
              </label>
            </div>

            {isAdmin && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveSystemSettings}
                  disabled={savingSystem}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 text-xs font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {savingSystem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>{savingSystem ? 'Saving Policy...' : 'Save System Governance Policy'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
