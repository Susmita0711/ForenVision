import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/navigation/Sidebar';
import { Topbar } from '../components/navigation/Topbar';
import { Modal } from '../components/common/Modal';
import { SearchInput } from '../components/common/SearchInput';
import { fetchCasesApi } from '../api/casesApi';
import { fetchEvidenceApi } from '../api/evidenceApi';
import type { ForensicCase, EvidenceItem } from '../types';
import { Briefcase, Database, ChevronRight, Loader2 } from 'lucide-react';

export const MainLayout: React.FC = () => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [liveCases, setLiveCases] = useState<ForensicCase[]>([]);
  const [liveEvidence, setLiveEvidence] = useState<EvidenceItem[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsQuickSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load live cases & evidence from backend when Omnisearch opens or query updates
  useEffect(() => {
    if (!isQuickSearchOpen) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      Promise.all([
        fetchCasesApi({ q: searchQuery.trim() || undefined, limit: 8 }).catch(() => ({
          success: false,
          cases: [] as ForensicCase[],
        })),
        fetchEvidenceApi({ q: searchQuery.trim() || undefined, limit: 8 }).catch(() => ({
          success: false,
          evidence: [] as EvidenceItem[],
        })),
      ])
        .then(([caseRes, evRes]) => {
          if (!active) return;
          setLiveCases(caseRes.cases || []);
          setLiveEvidence(evRes.evidence || []);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isQuickSearchOpen, searchQuery]);

  const filteredCases = liveCases.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.caseNumber.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q)
    );
  });

  const filteredEvidence = liveEvidence.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.evidenceNumber.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.sha256Hash.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0F19] text-slate-100 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Sidebar Navigation (Fixed to Left Viewport) */}
      <Sidebar
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
      />

      {/* Main Viewport Shell with padding offset for fixed sidebar */}
      <div
        className={`flex flex-1 flex-col min-w-0 h-screen overflow-hidden transition-all duration-300 ${
          isCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        }`}
      >
        <Topbar
          onToggleMobileMenu={() => setIsMobileOpen(true)}
          onOpenQuickSearch={() => setIsQuickSearchOpen(true)}
        />

        {/* Main Scrollable Content Container */}
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Subtle Footer */}
        <footer className="border-t border-slate-800/80 bg-[#0B0F19] px-6 py-4 text-center text-xs text-slate-500 shrink-0">
          <p>
            ForenVision AI &copy; 2026 &mdash; Digital Forensics & Cryptographic Chain-of-Custody Core
          </p>
        </footer>
      </div>

      {/* Global Command Palette / Quick Search Modal */}
      <Modal
        isOpen={isQuickSearchOpen}
        onClose={() => {
          setIsQuickSearchOpen(false);
          setSearchQuery('');
        }}
        title="Forensic Omnisearch"
        subtitle="Quickly locate cases, evidence items, or cryptographic digests"
        size="lg"
      >
        <div className="space-y-4">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by Case ID (e.g. CAS-2026), Evidence ID, or SHA-256..."
            className="w-full"
          />

          {searching && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
              <span>Querying forensic ledger...</span>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto space-y-4 pr-1">
            {/* Cases */}
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500 font-semibold mb-2">
                Matched Cases ({filteredCases.length})
              </p>
              {filteredCases.length === 0 ? (
                <p className="text-xs text-slate-500 px-1">No matching case dockets found.</p>
              ) : (
                <div className="space-y-1">
                  {filteredCases.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setIsQuickSearchOpen(false);
                        navigate(`/cases/${c.id}`);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Briefcase className="h-4 w-4 text-cyan-400 shrink-0" />
                        <div className="truncate">
                          <span className="font-mono text-cyan-300 mr-2">{c.caseNumber}</span>
                          <span className="text-slate-200">{c.title}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Evidence */}
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500 font-semibold mb-2">
                Matched Evidence Items ({filteredEvidence.length})
              </p>
              {filteredEvidence.length === 0 ? (
                <p className="text-xs text-slate-500 px-1">No matching evidence artifacts found.</p>
              ) : (
                <div className="space-y-1">
                  {filteredEvidence.slice(0, 5).map((e) => (
                    <div
                      key={e.id}
                      onClick={() => {
                        setIsQuickSearchOpen(false);
                        navigate(`/evidence/${e.id}`);
                      }}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Database className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <span className="font-mono text-emerald-400 mr-2">{e.evidenceNumber}</span>
                          <span className="text-slate-200">{e.name}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
