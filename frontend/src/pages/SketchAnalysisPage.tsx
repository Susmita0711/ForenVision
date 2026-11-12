import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  PenTool, 
  Sliders, 
  Download, 
  AlertTriangle, 
  ShieldCheck, 
  Eye, 
  History, 
  BookOpen, 
  Sparkles,
  Upload,
  Trash2,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { Breadcrumbs } from '../components/common/Breadcrumbs';
import { 
  getSketchMethodologyApi,
  uploadSketchEvidenceApi,
  preprocessEvidenceApi,
  saveSketchSessionApi,
  compareSketchExperimentalApi,
  getSketchHistoryApi,
  getSketchVisualizationBlobApi,
  downloadSketchVisualization,
  type SketchPreprocessingParams,
  type MorphologicalAnnotation,
  type SketchSessionRecord,
  type SketchMethodologyInfo,
  type ExperimentalSketchProbeResult
} from '../api/sketchAnalysisApi';
import { fetchEvidenceApi, fetchEvidencePreviewUrlApi } from '../api/evidenceApi';
import type { EvidenceItem } from '../types';

export const SketchAnalysisPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlEvidenceId = searchParams.get('evidenceId');

  // Evidence Selection
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>([]);
  const [sketchEvidenceId, setSketchEvidenceId] = useState<string>(urlEvidenceId || '');
  const [referenceEvidenceId, setReferenceEvidenceId] = useState<string>('');
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  // Previews
  const [sketchPreviewUrl, setSketchPreviewUrl] = useState<string | null>(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState<string | null>(null);
  const [annotatedVisualizationUrl, setAnnotatedVisualizationUrl] = useState<string | null>(null);

  // Preprocessing Parameters & Active Filter State
  const [sketchPreprocessing, setSketchPreprocessing] = useState<SketchPreprocessingParams>({
    grayscale: true,
    clahe: false,
    claheClipLimit: 2.0,
    edgeFilter: 'none',
    cannyLow: 50,
    cannyHigh: 150,
    invert: false,
    contrast: 1.0,
    brightness: 0,
  });

  const [referencePreprocessing, setReferencePreprocessing] = useState<SketchPreprocessingParams>({
    grayscale: true,
    clahe: false,
    claheClipLimit: 2.0,
    edgeFilter: 'none',
    cannyLow: 50,
    cannyHigh: 150,
    invert: false,
    contrast: 1.0,
    brightness: 0,
  });

  const [isApplyingSketchFilters, setIsApplyingSketchFilters] = useState(false);
  const [isApplyingRefFilters, setIsApplyingRefFilters] = useState(false);

  // Annotations & Morphological Checklist
  const [annotations, setAnnotations] = useState<MorphologicalAnnotation[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<MorphologicalAnnotation['feature']>('orbital_eyes');
  const [annotationNotes, setAnnotationNotes] = useState<string>('');

  const [morphologicalChecklist, setMorphologicalChecklist] = useState<Record<string, string>>({
    orbital_eyes: 'Inconclusive',
    eyebrows: 'Inconclusive',
    nasal_bridge: 'Inconclusive',
    mouth_lips: 'Inconclusive',
    jawline_chin: 'Inconclusive',
    hairline: 'Inconclusive',
    ear_morphology: 'Inconclusive',
  });
  const [examinerNotes, setExaminerNotes] = useState<string>('');
  const [sessionTitle, setSessionTitle] = useState<string>('Witness Sketch vs Reference Review');

  // Session Results & History
  const [currentSession, setCurrentSession] = useState<SketchSessionRecord | null>(null);
  const [experimentalResult, setExperimentalResult] = useState<ExperimentalSketchProbeResult | null>(null);
  const [isRunningExperimental, setIsRunningExperimental] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SketchSessionRecord[]>([]);
  const [methodologyInfo, setMethodologyInfo] = useState<SketchMethodologyInfo | null>(null);

  // UI State
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'visualizer' | 'checklist' | 'methodology' | 'history'>('visualizer');
  const [viewMode, setViewMode] = useState<'sideBySide' | 'derived' | 'sketchOnly' | 'referenceOnly'>('sideBySide');

  // Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCaseId, setUploadCaseId] = useState<string>('');
  const [uploadNotes, setUploadNotes] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const sketchImgRef = useRef<HTMLImageElement>(null);
  const refImgRef = useRef<HTMLImageElement>(null);

  // Fetch Methodology & Accessible Evidence on Mount
  useEffect(() => {
    getSketchMethodologyApi()
      .then((info) => setMethodologyInfo(info))
      .catch((err) => console.warn('Could not fetch sketch methodology:', err));

    setLoadingEvidence(true);
    fetchEvidenceApi()
      .then((res) => {
        const typeRank = (t?: string) => {
          if (t === 'sketch') return 0;
          if (t === 'face') return 1;
          if (t === 'image') return 2;
          return 3;
        };
        const imageItems = (res.evidence || [])
          .filter(
            (e) =>
              e.detectedMediaType?.startsWith('image/') ||
              e.type === 'sketch' ||
              e.type === 'face' ||
              e.type === 'image' ||
              e.name?.match(/\.(jpg|jpeg|png|tif|tiff|bmp)$/i)
          )
          .sort((a, b) => typeRank(a.type) - typeRank(b.type));
        setEvidenceList(imageItems);

        // Auto-select initial sketch and paired face reference
        let chosenSketch = imageItems.find((e) => e.id === urlEvidenceId) || imageItems.find((e) => e.type === 'sketch') || imageItems[0];
        if (chosenSketch) {
          setSketchEvidenceId(chosenSketch.id);
        }

        const photoItem =
          imageItems.find((e) => e.id !== chosenSketch?.id && e.type === 'face' && e.caseId === chosenSketch?.caseId) ||
          imageItems.find((e) => e.id !== chosenSketch?.id && e.type === 'face') ||
          imageItems.find((e) => e.id !== chosenSketch?.id && e.type === 'image') ||
          imageItems.find((e) => e.id !== chosenSketch?.id);
        if (photoItem) {
          setReferenceEvidenceId(photoItem.id);
        }
      })
      .catch((err) => setError(`Failed to load evidence artifacts: ${err.message}`))
      .finally(() => setLoadingEvidence(false));
  }, [urlEvidenceId]);

  // Load Sketch Preview
  useEffect(() => {
    if (!sketchEvidenceId) {
      setSketchPreviewUrl(null);
      return;
    }
    let active = true;
    fetchEvidencePreviewUrlApi(sketchEvidenceId)
      .then((url) => {
        if (active) setSketchPreviewUrl(url);
      })
      .catch(() => {
        if (active) setSketchPreviewUrl(null);
      });

    // Load History for this evidence
    getSketchHistoryApi(sketchEvidenceId)
      .then((hist) => {
        if (active) setSessionHistory(hist);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [sketchEvidenceId]);

  // Load Reference Preview
  useEffect(() => {
    if (!referenceEvidenceId) {
      setReferencePreviewUrl(null);
      return;
    }
    let active = true;
    fetchEvidencePreviewUrlApi(referenceEvidenceId)
      .then((url) => {
        if (active) setReferencePreviewUrl(url);
      })
      .catch(() => {
        if (active) setReferencePreviewUrl(null);
      });

    return () => {
      active = false;
    };
  }, [referenceEvidenceId]);

  // Apply Sketch Preprocessing Filters
  const handleApplySketchPreprocessing = async () => {
    if (!sketchEvidenceId) return;
    setIsApplyingSketchFilters(true);
    setError(null);
    try {
      const res = await preprocessEvidenceApi({
        evidenceId: sketchEvidenceId,
        params: sketchPreprocessing,
      });
      setSketchPreviewUrl(res.previewDataUrl);
      setSuccessMessage('Sketch preprocessing applied to working copy.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Preprocessing failed.');
    } finally {
      setIsApplyingSketchFilters(false);
    }
  };

  // Reset Sketch Preprocessing
  const handleResetSketchPreprocessing = async () => {
    if (!sketchEvidenceId) return;
    try {
      const originalUrl = await fetchEvidencePreviewUrlApi(sketchEvidenceId);
      setSketchPreviewUrl(originalUrl);
      setSketchPreprocessing({
        grayscale: false,
        clahe: false,
        claheClipLimit: 2.0,
        edgeFilter: 'none',
        cannyLow: 50,
        cannyHigh: 150,
        invert: false,
        contrast: 1.0,
        brightness: 0,
      });
    } catch (err) {
      console.warn('Failed to reset preview:', err);
    }
  };

  // Apply Reference Preprocessing Filters
  const handleApplyRefPreprocessing = async () => {
    if (!referenceEvidenceId) return;
    setIsApplyingRefFilters(true);
    setError(null);
    try {
      const res = await preprocessEvidenceApi({
        evidenceId: referenceEvidenceId,
        params: referencePreprocessing,
      });
      setReferencePreviewUrl(res.previewDataUrl);
      setSuccessMessage('Reference photo preprocessing applied to working copy.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Reference preprocessing failed.');
    } finally {
      setIsApplyingRefFilters(false);
    }
  };

  // Reset Reference Preprocessing
  const handleResetRefPreprocessing = async () => {
    if (!referenceEvidenceId) return;
    try {
      const originalUrl = await fetchEvidencePreviewUrlApi(referenceEvidenceId);
      setReferencePreviewUrl(originalUrl);
      setReferencePreprocessing({
        grayscale: false,
        clahe: false,
        claheClipLimit: 2.0,
        edgeFilter: 'none',
        cannyLow: 50,
        cannyHigh: 150,
        invert: false,
        contrast: 1.0,
        brightness: 0,
      });
    } catch (err) {
      console.warn('Failed to reset reference preview:', err);
    }
  };

  // Click on Canvas to Pin Annotation
  const handleImageClick = (
    e: React.MouseEvent<HTMLImageElement>,
    target: 'sketch' | 'reference'
  ) => {
    const imgEl = target === 'sketch' ? sketchImgRef.current : refImgRef.current;
    if (!imgEl) return;

    const rect = imgEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = Math.max(0.02, Math.min(0.98, clickX / rect.width));
    const normY = Math.max(0.02, Math.min(0.98, clickY / rect.height));

    const newAnnotation: MorphologicalAnnotation = {
      id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      target,
      feature: selectedFeature,
      x: normX,
      y: normY,
      notes: annotationNotes || `Pinned ${selectedFeature.replace(/_/g, ' ')} observation`,
    };

    setAnnotations((prev) => [...prev, newAnnotation]);
    setAnnotationNotes('');
    setSuccessMessage(`Placed annotation #${annotations.length + 1} on ${target}.`);
    setTimeout(() => setSuccessMessage(null), 2500);
  };

  const handleRemoveAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  // Save Comparison Session
  const handleSaveSession = async () => {
    if (!sketchEvidenceId || !referenceEvidenceId) {
      setError('Please select both a Sketch and a Reference photograph.');
      return;
    }

    if (sketchEvidenceId === referenceEvidenceId) {
      setError('Sketch and Reference evidence cannot be the identical artifact.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await saveSketchSessionApi({
        sketchEvidenceId,
        referenceEvidenceId,
        title: sessionTitle,
        sketchPreprocessing,
        referencePreprocessing,
        annotations,
        morphologicalChecklist,
        examinerNotes,
      });

      setCurrentSession(result);

      // Stream generated derived visualization
      const blob = await getSketchVisualizationBlobApi(result.sessionId);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));

      // Refresh history
      const updatedHistory = await getSketchHistoryApi(sketchEvidenceId);
      setSessionHistory(updatedHistory);

      setSuccessMessage('Comparison session recorded successfully in case audit trail.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to save comparison session.');
    } finally {
      setIsSaving(false);
    }
  };

  // Execute Experimental CUHK Cross-Modality Probe
  const handleRunExperimentalProbe = async () => {
    if (!sketchEvidenceId || !referenceEvidenceId) {
      setError('Please select both a Sketch and a Reference photograph.');
      return;
    }
    if (sketchEvidenceId === referenceEvidenceId) {
      setError('Sketch and Reference evidence cannot be the identical artifact.');
      return;
    }

    setIsRunningExperimental(true);
    setError(null);
    try {
      const probe = await compareSketchExperimentalApi({
        sketchEvidenceId,
        referenceEvidenceId,
        saveAnalysis: true,
      });
      setExperimentalResult(probe);
      const blob = await getSketchVisualizationBlobApi(probe.analysisId);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));
      setViewMode('derived');
      setSuccessMessage('CUHK cross-modality exploratory probe completed (non-admissible investigative aid).');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Experimental cross-modality probe failed.');
    } finally {
      setIsRunningExperimental(false);
    }
  };

  // Upload New Sketch Evidence
  const handleUploadSketchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setError('Please choose a sketch image to upload.');
      return;
    }
    if (!uploadCaseId) {
      setError('Please specify the associated Case ID.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const ev = await uploadSketchEvidenceApi(uploadFile, uploadCaseId, uploadNotes);
      setSuccessMessage(`Sketch evidence [${ev.evidenceNumber}] uploaded to case.`);
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadNotes('');

      // Refresh evidence list
      const res = await fetchEvidenceApi();
      const imageItems = (res.evidence || []).filter(
        (e) =>
          e.detectedMediaType?.startsWith('image/') ||
          e.type === 'sketch' ||
          e.type === 'image' ||
          e.name?.match(/\.(jpg|jpeg|png|tif|tiff|bmp)$/i)
      );
      setEvidenceList(imageItems);
      setSketchEvidenceId(ev.id);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to upload sketch.');
    } finally {
      setIsUploading(false);
    }
  };

  // Load Past Session from History
  const handleLoadSession = async (session: SketchSessionRecord) => {
    setCurrentSession(session);
    setAnnotations(session.annotations || []);
    setMorphologicalChecklist(session.morphologicalChecklist || {});
    setExaminerNotes(session.examinerNotes || '');
    setSessionTitle(session.title || 'Loaded Session');
    setActiveTab('visualizer');
    setViewMode('derived');

    try {
      const blob = await getSketchVisualizationBlobApi(session.sessionId);
      if (annotatedVisualizationUrl) {
        URL.revokeObjectURL(annotatedVisualizationUrl);
      }
      setAnnotatedVisualizationUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.warn('Could not stream derived visualization:', err);
    }
  };

  const selectedSketch = evidenceList.find((e) => e.id === sketchEvidenceId);
  const selectedReference = evidenceList.find((e) => e.id === referenceEvidenceId);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'AI Forensic Modules' },
          { label: 'Witness Sketch Analysis' },
        ]}
        title="Witness Sketch Analysis & Morphological Comparison"
        description="Preserve witness sketch immutability, apply documented image preprocessing (CLAHE, pencil stroke extraction, normalization), record spatial morphological annotations, and save structured ACE-V comparison sessions."
        badge={
          <span className="rounded bg-cyan-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-400 border border-cyan-500/30 flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" />
            ACE-V Qualitative Review (No Automated Accusation)
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 text-xs font-semibold shadow-md transition-all active:scale-95"
            >
              <Upload className="h-3.5 w-3.5 text-cyan-400" />
              <span>Upload Sketch</span>
            </button>
            {methodologyInfo?.experimentalModel?.available && (
              <button
                onClick={handleRunExperimentalProbe}
                disabled={isRunningExperimental || !sketchEvidenceId || !referenceEvidenceId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600/90 hover:bg-purple-500 text-white px-3.5 py-1.5 text-xs font-semibold shadow-lg transition-all active:scale-95 disabled:opacity-50"
              >
                <Sparkles className={`h-3.5 w-3.5 ${isRunningExperimental ? 'animate-spin' : ''}`} />
                <span>{isRunningExperimental ? 'Running CUHK Probe...' : 'CUHK Cross-Modality Probe'}</span>
              </button>
            )}
            <button
              onClick={handleSaveSession}
              disabled={isSaving || !sketchEvidenceId || !referenceEvidenceId}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-1.5 text-xs font-semibold shadow-lg shadow-cyan-950/40 transition-all active:scale-95 disabled:opacity-50"
            >
              <FileText className={`h-3.5 w-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Recording Session...' : 'Save Comparison Session'}</span>
            </button>
          </div>
        }
      />

      {/* Prominent Legal & Forensic Limitations Warning */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-amber-300 tracking-wide uppercase font-mono text-[11px]">
              Scientific Limitations & Legal Standards (OSAC / Daubert Notice)
            </p>
            <p className="text-amber-200/80 leading-relaxed">
              Composite sketches are cognitive approximations derived from witness memory, not photographic records. 
              Due to human memory distortions and artist subjectivity, sketch-to-photo matching <span className="font-semibold text-white">cannot reliably prove physical identity</span>. 
              Automated cross-modality matching models currently lack empirical forensic validation under Daubert/Frye standards and are marked as <span className="font-semibold text-amber-300">EXPERIMENTAL / UNAVAILABLE</span>. 
              ForenVision AI does not fabricate similarity scores or accuse individuals. All evaluations must be conducted as structured morphological reviews by qualified human examiners under ACE-V methodology.
            </p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs text-rose-400 hover:text-white underline font-mono">
            Dismiss
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-xs text-emerald-400 hover:text-white underline font-mono">
            Dismiss
          </button>
        </div>
      )}

      {/* Evidence Selectors Bar */}
      <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sketch Evidence Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                Witness Composite Sketch Artifact
              </span>
              {selectedSketch && (
                <span className="font-mono text-[11px] text-slate-400">
                  Case: {selectedSketch.caseNumber}
                </span>
              )}
            </label>
            <select
              value={sketchEvidenceId}
              onChange={(e) => setSketchEvidenceId(e.target.value)}
              disabled={loadingEvidence}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">-- Select Witness Sketch --</option>
              {evidenceList.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.evidenceNumber}] {e.name || e.originalFileName} ({e.caseNumber}) {e.type === 'sketch' ? '★ SKETCH' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Photo Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Investigator Selected Reference Exemplar
              </span>
              {selectedReference && (
                <span className="font-mono text-[11px] text-slate-400">
                  Case: {selectedReference.caseNumber}
                </span>
              )}
            </label>
            <select
              value={referenceEvidenceId}
              onChange={(e) => setReferenceEvidenceId(e.target.value)}
              disabled={loadingEvidence}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">-- Select Reference Photograph --</option>
              {evidenceList.map((e) => (
                <option key={e.id} value={e.id}>
                  [{e.evidenceNumber}] {e.name || e.originalFileName} ({e.caseNumber})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Comparison Canvas & Control Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Viewport and Tabs */}
        <div className="lg:col-span-2 space-y-4">
          {/* View Modes & Tab Switchers */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('visualizer')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'visualizer'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="h-3.5 w-3.5 text-cyan-400" />
                <span>Side-by-Side Review</span>
              </button>
              <button
                onClick={() => setActiveTab('checklist')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'checklist'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Morphological Checklist</span>
              </button>
              <button
                onClick={() => setActiveTab('methodology')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'methodology'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5 text-blue-400" />
                <span>Methodology & Caveats</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'history'
                    ? 'bg-slate-800 text-white border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="h-3.5 w-3.5 text-purple-400" />
                <span>Session History ({sessionHistory.length})</span>
              </button>
            </div>

            {/* View Mode */}
            {activeTab === 'visualizer' && (
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setViewMode('sideBySide')}
                  className={`px-2 py-1 rounded font-medium transition-all ${
                    viewMode === 'sideBySide' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Interactive Dual
                </button>
                <button
                  onClick={() => setViewMode('derived')}
                  disabled={!annotatedVisualizationUrl}
                  className={`px-2 py-1 rounded font-medium transition-all ${
                    viewMode === 'derived' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200 disabled:opacity-40'
                  }`}
                >
                  Derived Canvas
                </button>
                <button
                  onClick={() => setViewMode('sketchOnly')}
                  className={`px-2 py-1 rounded font-medium transition-all ${
                    viewMode === 'sketchOnly' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Sketch
                </button>
                <button
                  onClick={() => setViewMode('referenceOnly')}
                  className={`px-2 py-1 rounded font-medium transition-all ${
                    viewMode === 'referenceOnly' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Reference
                </button>
              </div>
            )}
          </div>

          {/* TAB 1: VISUALIZER */}
          {activeTab === 'visualizer' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-4 shadow-xl space-y-4">
              {experimentalResult && (
                <div className="rounded-xl border border-purple-500/40 bg-purple-950/20 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-purple-400" />
                      <span className="text-xs font-bold text-white uppercase tracking-wider">
                        CUHK Cross-Modality Diagnostic Result
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[10px] font-mono text-amber-300">
                      EXPERIMENTAL / NOT DAUBERT ADMISSIBLE
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-400">CUHK Aligned Cosine</p>
                      <p className="text-base font-bold font-mono text-purple-300">
                        {experimentalResult.metrics.alignedCosineSimilarity.toFixed(4)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-400">Raw SFace Baseline</p>
                      <p className="text-base font-bold font-mono text-slate-300">
                        {experimentalResult.metrics.baselineRawSFaceSimilarity.toFixed(4)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-400">Aligned L2 Distance</p>
                      <p className="text-base font-bold font-mono text-cyan-300">
                        {experimentalResult.metrics.alignedL2Distance.toFixed(4)}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                      <p className="text-[10px] text-slate-400">Exploratory Band</p>
                      <p className="text-[11px] font-bold font-mono text-emerald-300 mt-1">
                        {experimentalResult.metrics.exploratoryBand.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 space-y-2">
                    <p>
                      Model: <span className="text-slate-200 font-mono">{experimentalResult.modelInfo.modelName}</span>
                    </p>
                    {(experimentalResult.modelInfo.benchmarkEvaluation?.heldOutTest?.cuhkTrainedAdapter ||
                      experimentalResult.modelInfo.benchmarkTestMetrics?.cuhkTrainedAdapter) && (() => {
                      const testSet =
                        experimentalResult.modelInfo.benchmarkEvaluation?.heldOutTest ||
                        experimentalResult.modelInfo.benchmarkTestMetrics;
                      const adapter = testSet?.cuhkTrainedAdapter;
                      const base = testSet?.baselineRawSFace;
                      if (!adapter) return null;
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[10px] p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                          <div>
                            <span className="text-slate-500 block">Held-Out Rank-1</span>
                            <span className="text-emerald-300 font-bold text-xs">{(adapter.rank1Accuracy * 100).toFixed(2)}%</span>
                            {base && <span className="text-slate-500 block">Base: {(base.rank1Accuracy * 100).toFixed(2)}%</span>}
                          </div>
                          <div>
                            <span className="text-slate-500 block">Rank-5 Accuracy</span>
                            <span className="text-cyan-300 font-bold text-xs">{(adapter.rank5Accuracy * 100).toFixed(1)}%</span>
                            {base && <span className="text-slate-500 block">Base: {(base.rank5Accuracy * 100).toFixed(1)}%</span>}
                          </div>
                          <div>
                            <span className="text-slate-500 block">ROC-AUC</span>
                            <span className="text-purple-300 font-bold text-xs">{adapter.rocAuc.toFixed(4)}</span>
                            {base && <span className="text-slate-500 block">Base: {base.rocAuc.toFixed(4)}</span>}
                          </div>
                          <div>
                            <span className="text-slate-500 block">Cosine Margin</span>
                            <span className="text-emerald-300 font-bold text-xs">+{adapter.separationMargin.toFixed(4)}</span>
                            {base && <span className="text-slate-500 block">Base: +{base.separationMargin.toFixed(4)}</span>}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-cyan-400" />
                  <span className="font-semibold text-slate-200">
                    {viewMode === 'sideBySide' && 'Click anywhere on Sketch or Reference to pin morphological annotations'}
                    {viewMode === 'derived' && 'Saved Derived Composite Canvas'}
                    {viewMode === 'sketchOnly' && `Sketch: ${selectedSketch?.name || 'Artifact'}`}
                    {viewMode === 'referenceOnly' && `Reference: ${selectedReference?.name || 'Artifact'}`}
                  </span>
                </div>

                {(annotatedVisualizationUrl && (currentSession?.sessionId || experimentalResult?.analysisId)) && (
                  <button
                    onClick={() => {
                      const targetId = viewMode === 'derived' && experimentalResult?.analysisId && !currentSession
                        ? experimentalResult.analysisId
                        : currentSession?.sessionId || experimentalResult?.analysisId;
                      if (targetId) downloadSketchVisualization(targetId);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-mono text-slate-300 hover:text-white transition-all"
                  >
                    <Download className="h-3 w-3 text-cyan-400" />
                    <span>Export Session JPEG</span>
                  </button>
                )}
              </div>

              {/* Viewport Canvas */}
              <div className="relative rounded-lg border border-slate-800 bg-slate-950 flex items-center justify-center min-h-[480px] overflow-hidden p-2">
                {viewMode === 'derived' && annotatedVisualizationUrl ? (
                  <img
                    src={annotatedVisualizationUrl}
                    alt="Derived Sketch Comparison Canvas"
                    className="max-h-[560px] w-auto object-contain"
                  />
                ) : viewMode === 'sideBySide' ? (
                  <div className="grid grid-cols-2 gap-3 w-full h-full">
                    {/* Sketch Side with Annotations */}
                    <div className="space-y-1 text-center">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-mono font-semibold text-cyan-400 uppercase">
                          Witness Sketch Working Copy
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {annotations.filter((a) => a.target === 'sketch').length} pins
                        </span>
                      </div>
                      <div className="relative inline-block border border-slate-800 rounded overflow-hidden max-h-[460px]">
                        {sketchPreviewUrl ? (
                          <>
                            <img
                              ref={sketchImgRef}
                              src={sketchPreviewUrl}
                              alt="Sketch"
                              onClick={(e) => handleImageClick(e, 'sketch')}
                              className="max-h-[450px] w-auto object-contain cursor-crosshair"
                            />
                            {/* Render Annotation Pins on Sketch */}
                            {annotations
                              .filter((a) => a.target === 'sketch')
                              .map((ann, idx) => (
                                <div
                                  key={ann.id}
                                  style={{
                                    left: `${ann.x * 100}%`,
                                    top: `${ann.y * 100}%`,
                                  }}
                                  title={`${ann.feature}: ${ann.notes}`}
                                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-cyan-500/80 border-2 border-white text-white font-mono text-[10px] font-bold shadow-lg shadow-cyan-950/80 cursor-pointer pointer-events-none"
                                >
                                  {idx + 1}
                                </div>
                              ))}
                          </>
                        ) : (
                          <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                            No sketch selected
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Reference Side with Annotations */}
                    <div className="space-y-1 text-center">
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] font-mono font-semibold text-emerald-400 uppercase">
                          Reference Exemplar Working Copy
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {annotations.filter((a) => a.target === 'reference').length} pins
                        </span>
                      </div>
                      <div className="relative inline-block border border-slate-800 rounded overflow-hidden max-h-[460px]">
                        {referencePreviewUrl ? (
                          <>
                            <img
                              ref={refImgRef}
                              src={referencePreviewUrl}
                              alt="Reference Exemplar"
                              onClick={(e) => handleImageClick(e, 'reference')}
                              className="max-h-[450px] w-auto object-contain cursor-crosshair"
                            />
                            {/* Render Annotation Pins on Reference */}
                            {annotations
                              .filter((a) => a.target === 'reference')
                              .map((ann, idx) => (
                                <div
                                  key={ann.id}
                                  style={{
                                    left: `${ann.x * 100}%`,
                                    top: `${ann.y * 100}%`,
                                  }}
                                  title={`${ann.feature}: ${ann.notes}`}
                                  className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/80 border-2 border-white text-white font-mono text-[10px] font-bold shadow-lg shadow-emerald-950/80 cursor-pointer pointer-events-none"
                                >
                                  {idx + 1}
                                </div>
                              ))}
                          </>
                        ) : (
                          <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                            No reference selected
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : viewMode === 'sketchOnly' && sketchPreviewUrl ? (
                  <img src={sketchPreviewUrl} alt="Sketch Only" className="max-h-[500px] w-auto object-contain" />
                ) : viewMode === 'referenceOnly' && referencePreviewUrl ? (
                  <img src={referencePreviewUrl} alt="Reference Only" className="max-h-[500px] w-auto object-contain" />
                ) : (
                  <div className="text-center p-8 text-xs text-slate-500">
                    Select sketch and reference evidence items above to begin.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MORPHOLOGICAL CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4 text-xs">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-white">Forensic Morphological Feature Checklist</h3>
                <p className="text-slate-400 text-[11px]">
                  Manual qualitative feature comparison aligned with OSAC Facial Comparison Standards (ASTM E3115).
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'orbital_eyes', label: 'Orbital Region & Eye Slant' },
                  { key: 'eyebrows', label: 'Eyebrow Arch, Density & Spacing' },
                  { key: 'nasal_bridge', label: 'Nasal Bridge, Tip & Aperture' },
                  { key: 'mouth_lips', label: 'Vermilion Border & Labial Metrics' },
                  { key: 'jawline_chin', label: 'Mandibular Jawline Contour & Mentalis' },
                  { key: 'hairline', label: 'Cranial Hairline & Forehead Proportion' },
                  { key: 'ear_morphology', label: 'Auricular Ear Structure & Lobule' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="font-medium text-slate-200">{label}</span>
                    <div className="flex items-center gap-1.5">
                      {['Consistent', 'Moderate Congruence', 'Inconclusive', 'Divergent'].map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setMorphologicalChecklist((prev) => ({ ...prev, [key]: opt }))}
                          className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                            morphologicalChecklist[key] === opt
                              ? opt === 'Consistent'
                                ? 'bg-emerald-600 text-white'
                                : opt === 'Moderate Congruence'
                                ? 'bg-cyan-600 text-white'
                                : opt === 'Divergent'
                                ? 'bg-rose-600 text-white'
                                : 'bg-slate-700 text-white'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <label className="text-xs font-semibold text-slate-300">Examiner Morphological Findings & Synthesis Notes:</label>
                <textarea
                  rows={3}
                  value={examinerNotes}
                  onChange={(e) => setExaminerNotes(e.target.value)}
                  placeholder="Record qualitative observations, witness interview conditions, lighting caveats, or specific feature discrepancies..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* TAB 3: METHODOLOGY & CAVEATS */}
          {activeTab === 'methodology' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4 text-xs">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-semibold text-white">Scientific Rationale & Legal Constraints</h3>
                <p className="text-slate-400 text-[11px]">Why ForenVision AI bars automated sketch-to-photo accusations.</p>
              </div>

              {methodologyInfo ? (
                <div className="space-y-3.5 leading-relaxed">
                  <div className="rounded-lg bg-slate-950 p-3.5 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase font-bold text-cyan-400 block">Cross-Domain Matching Status:</span>
                    <p className="font-semibold text-slate-200">{methodologyInfo.modelStatus.automatedMatching}</p>
                    <p className="text-slate-400 text-[11px]">{methodologyInfo.modelStatus.validationRationale}</p>
                  </div>

                  {methodologyInfo.experimentalModel?.available && (
                    <div className="rounded-lg bg-purple-950/20 p-3.5 border border-purple-500/30 space-y-2.5">
                      <span className="text-[10px] font-mono uppercase font-bold text-purple-300 block">
                        Experimental CUHK-Trained Diagnostic Model &amp; Accuracy Benchmarks:
                      </span>
                      <p className="font-semibold text-white">{methodologyInfo.experimentalModel.modelName}</p>
                      <p className="text-slate-300 text-[11px]">{methodologyInfo.experimentalModel.architecture}</p>
                      {methodologyInfo.experimentalModel.evaluationMetrics?.heldOutTest?.cuhkTrainedAdapter && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
                          <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <span className="text-slate-400 block">Test Rank-1 (28 subj)</span>
                            <span className="text-emerald-300 font-bold text-xs">
                              {(methodologyInfo.experimentalModel.evaluationMetrics.heldOutTest.cuhkTrainedAdapter.rank1Accuracy * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <span className="text-slate-400 block">Test Rank-5</span>
                            <span className="text-cyan-300 font-bold text-xs">
                              {(methodologyInfo.experimentalModel.evaluationMetrics.heldOutTest.cuhkTrainedAdapter.rank5Accuracy * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <span className="text-slate-400 block">Test ROC-AUC</span>
                            <span className="text-purple-300 font-bold text-xs">
                              {methodologyInfo.experimentalModel.evaluationMetrics.heldOutTest.cuhkTrainedAdapter.rocAuc.toFixed(4)}
                            </span>
                          </div>
                          <div className="p-2 rounded bg-slate-950 border border-slate-800">
                            <span className="text-slate-400 block">Separation Margin</span>
                            <span className="text-emerald-300 font-bold text-xs">
                              +{methodologyInfo.experimentalModel.evaluationMetrics.heldOutTest.cuhkTrainedAdapter.separationMargin.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      )}
                      <p className="text-amber-300/90 text-[11px]">{methodologyInfo.experimentalModel.admissibilityNotice}</p>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Scientific Rationale:</span>
                    <p className="text-slate-300 text-[11px]">{methodologyInfo.methodology.scientificRationale}</p>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Standards Compliance:</span>
                    <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                      {methodologyInfo.methodology.standardsCompliance.map((std, i) => (
                        <li key={i}>{std}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg bg-slate-950 p-3 border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-400 block">Biometric Retention Standard:</span>
                    <p className="text-slate-300 text-[11px]">{methodologyInfo.methodology.retentionPolicy}</p>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500">Loading methodology specifications...</p>
              )}
            </div>
          )}

          {/* TAB 4: SESSION HISTORY */}
          {activeTab === 'history' && (
            <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-white">Saved Sketch Comparison Sessions</h3>
                  <p className="text-[11px] text-slate-400">Past comparison audits associated with this evidence item.</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                  {sessionHistory.length} Sessions
                </span>
              </div>

              {sessionHistory.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">No prior sketch comparison sessions saved for this evidence.</p>
              ) : (
                <div className="space-y-2 max-h-[380px] overflow-y-auto">
                  {sessionHistory.map((item) => (
                    <div
                      key={item.sessionId || item.id}
                      className="rounded-lg bg-slate-950 p-3 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-cyan-400 font-semibold">{item.sessionId || item.id}</span>
                          <span className="text-slate-400">&bull;</span>
                          <span className="text-slate-300 font-medium">{item.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {item.timestamp ? new Date(item.timestamp).toUTCString() : 'Historical Run'} &bull; Examiner: {item.examiner?.name || 'Examiner'} ({item.annotationsCount} annotations)
                        </p>
                      </div>

                      <button
                        onClick={() => handleLoadSession(item)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 transition-colors"
                      >
                        Inspect
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right 1 Col: Preprocessing Controls & Annotation Manager */}
        <div className="space-y-4">
          {/* Preprocessing Controls Box */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Image Preprocessing</h3>
              </div>
            </div>

            {/* Sketch Preprocessing Sub-panel */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-cyan-400">Sketch Working Copy</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleResetSketchPreprocessing}
                    className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleApplySketchPreprocessing}
                    disabled={isApplyingSketchFilters}
                    className="px-2 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-semibold"
                  >
                    {isApplyingSketchFilters ? 'Filtering...' : 'Apply'}
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Stroke Filter:</span>
                  <select
                    value={sketchPreprocessing.edgeFilter || 'none'}
                    onChange={(e) => setSketchPreprocessing((prev) => ({ ...prev, edgeFilter: e.target.value as any }))}
                    className="rounded bg-slate-950 border border-slate-800 px-2 py-1 text-[11px] text-slate-200"
                  >
                    <option value="none">Standard Pencil Lines</option>
                    <option value="canny">Canny Stroke Isolator</option>
                    <option value="sobel">Sobel Gradient Filter</option>
                  </select>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">CLAHE Contrast:</span>
                  <input
                    type="checkbox"
                    checked={sketchPreprocessing.clahe}
                    onChange={(e) => setSketchPreprocessing((prev) => ({ ...prev, clahe: e.target.checked }))}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Invert Line Art:</span>
                  <input
                    type="checkbox"
                    checked={sketchPreprocessing.invert}
                    onChange={(e) => setSketchPreprocessing((prev) => ({ ...prev, invert: e.target.checked }))}
                    className="accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Reference Preprocessing Sub-panel */}
            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-emerald-400">Reference Photo</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleResetRefPreprocessing}
                    className="text-[10px] text-slate-400 hover:text-white underline font-mono"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleApplyRefPreprocessing}
                    disabled={isApplyingRefFilters}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold"
                  >
                    {isApplyingRefFilters ? 'Filtering...' : 'Apply'}
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Grayscale:</span>
                  <input
                    type="checkbox"
                    checked={referencePreprocessing.grayscale}
                    onChange={(e) => setReferencePreprocessing((prev) => ({ ...prev, grayscale: e.target.checked }))}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">CLAHE Equalizer:</span>
                  <input
                    type="checkbox"
                    checked={referencePreprocessing.clahe}
                    onChange={(e) => setReferencePreprocessing((prev) => ({ ...prev, clahe: e.target.checked }))}
                    className="accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Morphological Annotation Creator & List */}
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <PenTool className="h-4 w-4 text-cyan-400" />
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                  Morphological Pins ({annotations.length})
                </h3>
              </div>
            </div>

            {/* Tool Selector */}
            <div className="space-y-2 text-xs">
              <div className="space-y-1">
                <label className="text-slate-400 text-[11px]">Feature Target Category:</label>
                <select
                  value={selectedFeature}
                  onChange={(e) => setSelectedFeature(e.target.value as any)}
                  className="w-full rounded bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="orbital_eyes">Eyes / Orbital Slant</option>
                  <option value="eyebrows">Eyebrow Structure</option>
                  <option value="nasal_bridge_aperture">Nose / Nasal Aperture</option>
                  <option value="mouth_lips">Mouth / Vermilion Borders</option>
                  <option value="mandibular_jawline_chin">Jawline / Chin Mentalis</option>
                  <option value="hairline_cranial">Hairline / Forehead</option>
                  <option value="auricular_ears">Ears / Lobule</option>
                  <option value="scars_marks_tattoos">Scars / Marks / Unique Details</option>
                  <option value="general_facial_proportions">General Proportions</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 text-[11px]">Observation Note:</label>
                <input
                  type="text"
                  value={annotationNotes}
                  onChange={(e) => setAnnotationNotes(e.target.value)}
                  placeholder="e.g. Asymmetrical left eyebrow arch..."
                  className="w-full rounded bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>

              <p className="text-[10px] text-slate-500 italic">
                Tip: After entering notes, click directly on the image to place the numbered pin.
              </p>
            </div>

            {/* Annotations List */}
            {annotations.length > 0 && (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pt-2 border-t border-slate-800">
                {annotations.map((ann, idx) => (
                  <div
                    key={ann.id}
                    className="p-2 rounded bg-slate-950 border border-slate-800 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            ann.target === 'sketch' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          #{idx + 1} {ann.target.toUpperCase()}
                        </span>
                        <span className="text-slate-300 font-medium text-[11px]">{ann.feature.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{ann.notes}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveAnnotation(ann.id)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                      title="Delete Pin"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Upload Sketch Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="rounded-xl border border-slate-800 bg-[#0F172A] p-6 shadow-2xl max-w-md w-full space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Upload className="h-4 w-4 text-cyan-400" />
                Upload Witness Composite Sketch
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadSketchSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Select Sketch Image (JPEG/PNG):</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/tiff"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-400 text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Associated Case ID or Number:</label>
                <input
                  type="text"
                  required
                  value={uploadCaseId}
                  onChange={(e) => setUploadCaseId(e.target.value)}
                  placeholder="e.g. CAS-2026-8798 or case UUID"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Witness Interview Notes & Artist Context:</label>
                <textarea
                  rows={2}
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  placeholder="e.g. Witness interviewed 4 hours post-incident; composite prepared via Identi-KIT system..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{isUploading ? 'Uploading...' : 'Ingest Sketch'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
