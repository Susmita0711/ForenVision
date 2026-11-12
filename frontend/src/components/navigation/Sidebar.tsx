import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Shield, 
  LayoutDashboard, 
  Briefcase, 
  Database, 
  Link2, 
  Scan, 
  Target,
  Fingerprint, 
  ScanFace, 
  PenTool, 
  FileText, 
  BarChart3, 
  Users, 
  Settings, 
  X,
  ChevronLeft,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isMobileOpen: boolean;
  onMobileClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeColor?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen,
  onMobileClose,
  isCollapsed,
  onToggleCollapse,
}) => {
  const { user } = useAuth();
  const rawRole = (user?.role || 'viewer').toLowerCase();
  const role = rawRole === 'administrator' ? 'admin' 
    : rawRole === 'lead_examiner' ? 'investigator'
    : rawRole === 'technician' ? 'analyst'
    : rawRole;

  const userWorkflows: string[] = Array.isArray(user?.authorized_workflows) 
    ? user.authorized_workflows 
    : Array.isArray((user as unknown as { authorizedWorkflows?: string[] })?.authorizedWorkflows)
    ? (user as unknown as { authorizedWorkflows?: string[] }).authorizedWorkflows!
    : [];

  const hasFaceClearance = role === 'admin' || userWorkflows.includes('face_analysis');
  const hasSketchClearance = role === 'admin' || userWorkflows.includes('sketch_analysis');

  // Escape key closes mobile navigation drawer
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileOpen) {
        onMobileClose();
      }
    };
    if (isMobileOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileOpen, onMobileClose]);

  // Dynamically assemble navigation sections based on user role
  const getRoleNavSections = (): NavSection[] => {
    switch (role) {
      case 'admin':
        return [
          {
            title: 'Administration & Governance',
            items: [
              { name: 'User Management', path: '/users', icon: Users },
              { name: 'Application Settings', path: '/settings', icon: Settings },
              { name: 'Security Audit Logs', path: '/audit-logs', icon: ShieldAlert },
            ],
          },
          {
            title: 'Investigation Core',
            items: [
              { name: 'Agency Dashboard', path: '/dashboard', icon: LayoutDashboard },
              { name: 'Cases', path: '/cases', icon: Briefcase },
              { name: 'Evidence Vault', path: '/evidence', icon: Database },
              { name: 'Chain of Custody', path: '/chain-of-custody', icon: Link2 },
            ],
          },
          {
            title: 'Forensic Analysis Tools',
            items: [
              { name: 'Image Forgery (ELA)', path: '/analysis/image', icon: Scan },
              { name: 'AI Object Detection', path: '/analysis/detection', icon: Target },
              { name: 'Fingerprint AFIS', path: '/analysis/fingerprint', icon: Fingerprint },
              { name: 'Facial Verification', path: '/analysis/face', icon: ScanFace },
              { name: 'Sketch Composite', path: '/analysis/sketch', icon: PenTool },
            ],
          },
          {
            title: 'Reports & Intelligence',
            items: [
              { name: 'Forensic Reports', path: '/reports', icon: FileText },
              { name: 'Agency Analytics', path: '/analytics', icon: BarChart3 },
            ],
          },
        ];

      case 'investigator':
        return [
          {
            title: 'Investigator Operations',
            items: [
              { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
              { name: 'My Cases', path: '/cases', icon: Briefcase },
              { name: 'Evidence Vault', path: '/evidence', icon: Database },
              { name: 'Custody History', path: '/chain-of-custody', icon: Link2 },
            ],
          },
          {
            title: 'Forensic Analysis Tools',
            items: [
              { name: 'Image Forgery (ELA)', path: '/analysis/image', icon: Scan },
              { name: 'AI Object Detection', path: '/analysis/detection', icon: Target },
              { name: 'Fingerprint AFIS', path: '/analysis/fingerprint', icon: Fingerprint },
              { name: 'Facial Verification', path: '/analysis/face', icon: ScanFace },
              { name: 'Sketch Composite', path: '/analysis/sketch', icon: PenTool },
            ],
          },
          {
            title: 'Reporting',
            items: [
              { name: 'Case Reports', path: '/reports', icon: FileText },
              { name: 'Workload & Analytics', path: '/analytics', icon: BarChart3 },
            ],
          },
        ];

      case 'analyst': {
        const analysisItems: NavItem[] = [
          { name: 'Image Analysis', path: '/analysis/image', icon: Scan },
          { name: 'Fingerprint AFIS', path: '/analysis/fingerprint', icon: Fingerprint },
          { name: 'AI Object Detection', path: '/analysis/detection', icon: Target },
        ];

        if (hasFaceClearance) {
          analysisItems.push({ name: 'Facial Verification', path: '/analysis/face', icon: ScanFace });
        }
        if (hasSketchClearance) {
          analysisItems.push({ name: 'Sketch Analysis', path: '/analysis/sketch', icon: PenTool });
        }

        return [
          {
            title: 'Analyst Workspace',
            items: [
              { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
              { name: 'Assigned Cases', path: '/cases', icon: Briefcase },
              { name: 'Evidence Review', path: '/evidence', icon: Database },
            ],
          },
          {
            title: 'Authorized AI Modules',
            items: analysisItems,
          },
          {
            title: 'Results & Reports',
            items: [
              { name: 'Analysis Reports', path: '/reports', icon: FileText },
              { name: 'Analysis Results', path: '/analytics', icon: BarChart3 },
            ],
          },
        ];
      }

      case 'viewer':
      default:
        return [
          {
            title: 'Read-Only Portal',
            items: [
              { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
              { name: 'Authorized Cases', path: '/cases', icon: Briefcase },
              { name: 'Permitted Evidence', path: '/evidence', icon: Database },
              { name: 'Custody History', path: '/chain-of-custody', icon: Link2 },
              { name: 'Analysis Results', path: '/analytics', icon: BarChart3 },
              { name: 'Existing Reports', path: '/reports', icon: FileText },
            ],
          },
        ];
    }
  };

  const navSections = getRoleNavSections();

  const getRoleBadge = () => {
    switch (role) {
      case 'admin':
        return { label: 'ADMINISTRATOR', bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30' };
      case 'investigator':
        return { label: 'INVESTIGATOR', bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' };
      case 'analyst':
        return { label: 'FORENSIC ANALYST', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
      case 'viewer':
      default:
        return { label: 'READ-ONLY VIEWER', bg: 'bg-slate-700/30 text-slate-400 border-slate-600/30' };
    }
  };

  const badge = getRoleBadge();

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 h-screen z-40 flex flex-col border-r border-slate-800 bg-[#0B0F19] transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        } ${
          isMobileOpen
            ? 'translate-x-0 shadow-2xl z-50'
            : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-[1px] shadow-lg shadow-cyan-500/20">
              <div className="flex h-full w-full items-center justify-center rounded-[11px] bg-[#0B0F19]">
                <Shield className="h-5 w-5 text-cyan-400" />
              </div>
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm tracking-tight text-white">ForenVision</span>
                  <span className="rounded bg-cyan-500/10 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-cyan-400 border border-cyan-500/30">
                    AI
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono tracking-wide">EVIDENCE INTEGRITY</span>
              </div>
            )}
          </div>

          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Role Clearance Pill */}
        {!isCollapsed && (
          <div className="px-4 py-2.5 border-b border-slate-800/50 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-500 tracking-wider">CLEARANCE:</span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${badge.bg}`}>
                {badge.label}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Links Scrollable Area */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4 text-xs font-medium custom-scrollbar">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold mb-2">
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    aria-label={item.name}
                    onClick={() => {
                      if (isMobileOpen) onMobileClose();
                    }}
                    title={isCollapsed ? item.name : undefined}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${
                        isActive
                          ? 'bg-cyan-500/10 font-semibold text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-950/40'
                          : 'text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                      } ${isCollapsed ? 'justify-center px-0' : ''}`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                    {!isCollapsed && (
                      <span className="flex-1 truncate tracking-tight">{item.name}</span>
                    )}
                    {!isCollapsed && item.badge && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-cyan-400 border border-slate-700/80">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Collapse Toggle Footer (Desktop) */}
        <div className="hidden border-t border-slate-800/80 p-3 lg:block">
          <button
            onClick={onToggleCollapse}
            type="button"
            aria-label={isCollapsed ? 'Expand sidebar navigation' : 'Collapse sidebar navigation'}
            className="flex w-full items-center justify-center gap-2 rounded-lg p-2 text-slate-400 hover:bg-slate-850 hover:text-slate-200 transition-colors focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span className="text-[11px] font-mono text-slate-400">Collapse View</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
