import React, { useState, useEffect } from 'react';
import { 
  UserPlus,
  AlertCircle,
  CheckCircle2,
  UserCog,
  Check
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { DataTable, type Column } from '../components/common/DataTable';
import { SearchInput } from '../components/common/SearchInput';
import { StatusBadge } from '../components/common/StatusBadge';
import { Modal } from '../components/common/Modal';
import { ConfirmationDialog } from '../components/common/ConfirmationDialog';
import { useAuth } from '../context/AuthContext';
import { 
  fetchUsersApi, 
  provisionUserApi, 
  updateUserStatusApi,
  assignUserRoleApi
} from '../api/authApi';
import type { User, UserRole } from '../types';

export const UserManagementPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProvisionOpen, setIsProvisionOpen] = useState(false);
  const [selectedUserForToggle, setSelectedUserForToggle] = useState<User | null>(null);
  const [selectedUserForRole, setSelectedUserForRole] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // New user form state
  const [newName, setNewName] = useState('');
  const [newBadge, setNewBadge] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('Examiner@123!');
  const [newDept, setNewDept] = useState('Digital Forensic Integrity Division');
  const [newRole, setNewRole] = useState<UserRole>('analyst');
  const [newFaceClearance, setNewFaceClearance] = useState(false);
  const [newSketchClearance, setNewSketchClearance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit role modal state
  const [editRole, setEditRole] = useState<UserRole>('analyst');
  const [editFaceClearance, setEditFaceClearance] = useState(false);
  const [editSketchClearance, setEditSketchClearance] = useState(false);
  const [isSavingRole, setIsSavingRole] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetchUsersApi();
    if (res.success && res.users.length > 0) {
      setUsers(res.users);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.badgeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!newName.trim() || !newBadge.trim() || !newEmail.trim()) {
      setActionError('Full name, badge identifier, and authorized email are required.');
      return;
    }

    setIsSubmitting(true);
    const workflows: string[] = [];
    if (newFaceClearance) workflows.push('face_analysis');
    if (newSketchClearance) workflows.push('sketch_analysis');

    const res = await provisionUserApi({
      fullName: newName.trim(),
      badgeNumber: newBadge.trim().toUpperCase(),
      email: newEmail.trim(),
      password: newPassword,
      role: newRole,
      department: newDept,
      organization: 'ForenVision Forensic Laboratory',
    });

    setIsSubmitting(false);

    if (res.success && res.user) {
      // If specialized workflows were chosen, configure them
      if (workflows.length > 0) {
        await assignUserRoleApi(res.user.id, newRole, workflows);
      }
      setUsers((prev) => [res.user!, ...prev]);
      setIsProvisionOpen(false);
      setActionSuccess(`Examiner ${res.user.name} (${res.user.badgeNumber}) provisioned successfully.`);
      setNewName('');
      setNewBadge('');
      setNewEmail('');
      setNewPassword('Examiner@123!');
      setNewFaceClearance(false);
      setNewSketchClearance(false);
      loadUsers();
    } else {
      setActionError(res.error || 'Failed to provision examiner credentials.');
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedUserForToggle) return;
    setActionError(null);
    setActionSuccess(null);

    if (selectedUserForToggle.id === currentUser?.id) {
      setActionError('Security Policy: Administrators cannot deactivate their own active session.');
      setSelectedUserForToggle(null);
      return;
    }

    const newStatus = !selectedUserForToggle.is_active;
    const res = await updateUserStatusApi(selectedUserForToggle.id, newStatus);

    if (res.success && res.user) {
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUserForToggle.id ? res.user! : u))
      );
      setActionSuccess(
        `Clearance for ${selectedUserForToggle.name} ${newStatus ? 'restored' : 'revoked'} successfully.`
      );
    } else {
      setActionError(res.error || 'Failed to update user clearance status.');
    }

    setSelectedUserForToggle(null);
  };

  const openRoleModal = (u: User) => {
    setSelectedUserForRole(u);
    setEditRole(u.role);
    const workflows: string[] = Array.isArray(u.authorized_workflows) 
      ? u.authorized_workflows 
      : Array.isArray((u as unknown as { authorizedWorkflows?: string[] })?.authorizedWorkflows)
      ? (u as unknown as { authorizedWorkflows?: string[] }).authorizedWorkflows!
      : [];
    setEditFaceClearance(workflows.includes('face_analysis'));
    setEditSketchClearance(workflows.includes('sketch_analysis'));
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForRole) return;
    setActionError(null);
    setActionSuccess(null);
    setIsSavingRole(true);

    const workflows: string[] = [];
    if (editFaceClearance) workflows.push('face_analysis');
    if (editSketchClearance) workflows.push('sketch_analysis');

    const res = await assignUserRoleApi(selectedUserForRole.id, editRole, workflows);
    setIsSavingRole(false);

    if (res.success && res.user) {
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUserForRole.id ? res.user! : u))
      );
      setActionSuccess(`Role for ${selectedUserForRole.name} updated to [${editRole}].`);
      setSelectedUserForRole(null);
      loadUsers();
    } else {
      setActionError(res.error || 'Failed to update user role.');
    }
  };

  const columns: Column<User>[] = [
    {
      key: 'badgeNumber',
      header: 'Badge ID',
      sortable: true,
      width: '120px',
      render: (item) => (
        <span className="font-mono text-xs font-bold text-cyan-400">{item.badgeNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Personnel & Email',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-2.5">
          {item.avatarUrl ? (
            <img src={item.avatarUrl} alt={item.name} className="h-8 w-8 rounded-full object-cover border border-slate-700" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center font-mono text-xs text-cyan-300 font-bold">
              {item.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-100">{item.name}</p>
            <p className="text-[11px] text-slate-400">{item.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Assigned Department',
      sortable: true,
      render: (item) => (
        <span className="text-slate-300 text-xs">{item.department}</span>
      ),
    },
    {
      key: 'role',
      header: 'Clearance Tier',
      sortable: true,
      render: (item) => {
        const r = item.role.toLowerCase();
        const roleColor = 
          r === 'admin' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
          : r === 'investigator' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
          : r === 'analyst' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          : 'bg-slate-700/30 text-slate-300 border-slate-600/30';

        const workflows: string[] = Array.isArray(item.authorized_workflows) 
          ? item.authorized_workflows 
          : Array.isArray((item as unknown as { authorizedWorkflows?: string[] })?.authorizedWorkflows)
          ? (item as unknown as { authorizedWorkflows?: string[] }).authorizedWorkflows!
          : [];

        return (
          <div className="space-y-1">
            <span className={`inline-block font-mono text-[10px] px-2 py-0.5 rounded border uppercase font-semibold ${roleColor}`}>
              {item.role.replace(/_/g, ' ')}
            </span>
            {workflows.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {workflows.map(wf => (
                  <span key={wf} className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    +{wf.replace('_analysis', '')}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (item) => <StatusBadge status={item.status} size="sm" />,
    },
    {
      key: 'actions',
      header: 'Clearance Actions',
      align: 'right',
      render: (item) => {
        const isSelf = item.id === currentUser?.id;
        return (
          <div className="flex items-center justify-end gap-1.5">
            {/* Edit Role Button */}
            <button
              onClick={() => openRoleModal(item)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-medium bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 transition-colors"
              title="Assign role and specialized workflow clearances"
            >
              <UserCog className="h-3.5 w-3.5 text-cyan-400" />
              <span>Role</span>
            </button>

            {/* Toggle Status Button */}
            <button
              onClick={() => setSelectedUserForToggle(item)}
              disabled={isSelf}
              title={isSelf ? 'Cannot deactivate your own active session' : undefined}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                item.status === 'active'
                  ? 'bg-rose-950/40 text-rose-300 hover:bg-rose-900/60 border border-rose-800/50'
                  : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-800/50'
              }`}
            >
              {isSelf ? 'Self' : item.status === 'active' ? 'Suspend' : 'Activate'}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[{ label: 'Administration' }, { label: 'Personnel' }]}
        title="Examiner Personnel & Clearance Management"
        description="Provision, audit, and manage role clearances and specialized forensic authorizations across agency personnel."
        badge={
          <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400 border border-cyan-500/30">
            RBAC Enforced
          </span>
        }
        actions={
          <button
            onClick={() => setIsProvisionOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-2 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95"
          >
            <UserPlus className="h-4 w-4" />
            <span>Provision Examiner</span>
          </button>
        }
      />

      {/* Alerts */}
      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Filter by name, badge identifier, or department..."
          className="w-full sm:w-80"
        />
        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <span>Active Users: <strong className="text-white">{users.filter(u => u.status === 'active').length}</strong></span>
          <span>•</span>
          <span>Total: <strong className="text-white">{users.length}</strong></span>
        </div>
      </div>

      {/* Data Table */}
      <DataTable<User>
        data={filteredUsers}
        columns={columns}
        keyExtractor={(item) => item.id}
        isLoading={loading}
        emptyTitle="No Examiners Found"
        emptyDescription="No examiner profiles match the current filter criteria."
        pageSize={10}
      />

      {/* Provision Examiner Modal */}
      <Modal
        isOpen={isProvisionOpen}
        onClose={() => setIsProvisionOpen(false)}
        title="Provision Forensic Examiner Credentials"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsProvisionOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="provision-form"
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white shadow-md disabled:opacity-50"
            >
              {isSubmitting ? 'Provisioning...' : 'Provision Account'}
            </button>
          </div>
        }
      >
        <form id="provision-form" onSubmit={handleProvisionUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Full Legal Name *
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Dr. Eleanor Vance"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Badge Identifier *
              </label>
              <input
                type="text"
                value={newBadge}
                onChange={(e) => setNewBadge(e.target.value)}
                placeholder="FX-4091"
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Agency Email Address *
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.vance@forenvision.internal"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Temporary Passkey *
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Clearance Tier
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500"
              >
                <option value="admin">Administrator</option>
                <option value="investigator">Investigator</option>
                <option value="analyst">Analyst</option>
                <option value="viewer">Read-only Viewer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Department
              </label>
              <input
                type="text"
                value={newDept}
                onChange={(e) => setNewDept(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 py-1.5 px-3 text-xs text-white focus:border-cyan-500"
              />
            </div>
          </div>

          {newRole === 'analyst' && (
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold block">
                SPECIALIZED WORKFLOW CLEARANCE (ANALYST):
              </span>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newFaceClearance}
                  onChange={(e) => setNewFaceClearance(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                />
                <span>Facial Verification & Biometrics Clearance (`face_analysis`)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSketchClearance}
                  onChange={(e) => setNewSketchClearance(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                />
                <span>Forensic Sketch Composite Analysis (`sketch_analysis`)</span>
              </label>
            </div>
          )}
        </form>
      </Modal>

      {/* Role Assignment Modal */}
      <Modal
        isOpen={!!selectedUserForRole}
        onClose={() => setSelectedUserForRole(null)}
        title={`Assign Role Clearance: ${selectedUserForRole?.name}`}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSelectedUserForRole(null)}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="role-form"
              disabled={isSavingRole}
              className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-white shadow-md disabled:opacity-50"
            >
              {isSavingRole ? 'Updating Role...' : 'Save Role Clearance'}
            </button>
          </div>
        }
      >
        <form id="role-form" onSubmit={handleSaveRole} className="space-y-4">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block font-mono">BADGE ID</span>
              <span className="font-mono font-bold text-cyan-400">{selectedUserForRole?.badgeNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono">CURRENT ROLE</span>
              <span className="font-mono font-semibold text-slate-200 uppercase">{selectedUserForRole?.role}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-mono">STATUS</span>
              <span className="font-mono text-emerald-400 font-semibold">{selectedUserForRole?.status}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Select Clearance Tier *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { id: 'admin', label: 'Administrator', desc: 'Org-wide telemetry, user management, audit logs, and settings' },
                { id: 'investigator', label: 'Investigator', desc: 'Case creation, evidence intake, custody logging, reporting' },
                { id: 'analyst', label: 'Analyst', desc: 'Image forensics & fingerprint comparison. Specialized AI when cleared.' },
                { id: 'viewer', label: 'Read-only Viewer', desc: 'Strict read-only review of authorized cases and existing reports' },
              ].map((r) => (
                <div
                  key={r.id}
                  onClick={() => setEditRole(r.id as UserRole)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    editRole === r.id
                      ? 'bg-cyan-500/10 border-cyan-500/50 shadow-md shadow-cyan-950/30'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-white">{r.label}</span>
                    {editRole === r.id && <Check className="h-4 w-4 text-cyan-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{r.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {editRole === 'analyst' && (
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
              <span className="text-[11px] font-mono text-cyan-400 font-semibold block">
                SPECIALIZED WORKFLOW CLEARANCE (ANALYST):
              </span>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editFaceClearance}
                  onChange={(e) => setEditFaceClearance(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                />
                <span>Facial Verification & Quality Biometrics (`face_analysis`)</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editSketchClearance}
                  onChange={(e) => setEditSketchClearance(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                />
                <span>Forensic Sketch Composite Matching (`sketch_analysis`)</span>
              </label>
            </div>
          )}
        </form>
      </Modal>

      {/* Confirmation Dialog for Suspension */}
      <ConfirmationDialog
        isOpen={!!selectedUserForToggle}
        onClose={() => setSelectedUserForToggle(null)}
        onConfirm={handleToggleStatus}
        title={
          selectedUserForToggle?.status === 'active'
            ? 'Revoke Examiner Clearance'
            : 'Restore Examiner Clearance'
        }
        message={
          selectedUserForToggle?.status === 'active'
            ? `Are you sure you want to suspend credentials for ${selectedUserForToggle?.name} (${selectedUserForToggle?.badgeNumber})? This will immediately prevent them from authenticating or accessing endpoints.`
            : `Restore terminal clearance for ${selectedUserForToggle?.name} (${selectedUserForToggle?.badgeNumber})?`
        }
        variant={selectedUserForToggle?.status === 'active' ? 'danger' : 'info'}
        confirmLabel={selectedUserForToggle?.status === 'active' ? 'Suspend Badge' : 'Reactivate'}
      />
    </div>
  );
};
