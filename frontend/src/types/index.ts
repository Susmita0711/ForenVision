export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  app: string;
  version: string;
  database: {
    status: 'connected' | 'disconnected' | 'unconfigured';
    name?: string;
    message?: string;
    masked_uri?: string | null;
    latency_ms?: number | null;
    indexes_ready?: boolean;
  };
  environment: string;
}

export interface DatabaseHealthResponse {
  success: boolean;
  status: 'connected' | 'disconnected' | 'unconfigured';
  timestamp: string;
  database: {
    status: 'connected' | 'disconnected' | 'unconfigured';
    name?: string;
    message?: string;
    masked_uri?: string | null;
    latency_ms?: number | null;
    indexes_ready?: boolean;
  };
  ping: {
    connected: boolean;
    status: string;
    message: string;
    latency_ms?: number | null;
  };
  environment: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// User & Authentication Types
export type UserRole = 'admin' | 'investigator' | 'analyst' | 'viewer' | 'lead_examiner' | 'technician';

export interface User {
  id: string;
  badgeNumber: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  avatarUrl?: string;
  lastActive?: string;
  status: 'active' | 'suspended' | 'inactive';
  is_active?: boolean;
  created_at?: string;
  last_login?: string;
  organization?: string;
  full_name?: string;
  badge_number?: string;
  authorizedWorkflows?: string[];
  authorized_workflows?: string[];
}

// Case Management Types
export type CaseStatus = 'open' | 'in_progress' | 'under_review' | 'closed' | 'archived';
export type CasePriority = 'critical' | 'high' | 'medium' | 'low';

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ForensicCase {
  id: string;
  caseNumber: string; // e.g. "CAS-2026-8812"
  title: string;
  description: string;
  incidentType: 'Digital Forgery' | 'Cyber Crime' | 'Homicide / Scene' | 'Financial Fraud' | 'Biometric Match' | 'Identity Theft';
  status: CaseStatus;
  priority: CasePriority;
  leadInvestigator: string;
  assignedExaminers: string[];
  evidenceCount: number;
  chainOfCustodyCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  archivedAt?: string;
  is_archived?: boolean;
  is_restricted?: boolean;
  tags: string[];
}

// Evidence Vault & Chain of Custody Types
export type EvidenceType = 'image' | 'fingerprint' | 'face' | 'sketch' | 'document' | 'video' | 'digital_artifact';
export type IntegrityStatus = 'verified' | 'tampered' | 'unverified' | 'processing';

export interface EvidenceItem {
  id: string;
  caseId: string;
  caseNumber: string;
  evidenceNumber: string; // e.g. "EVD-4091"
  name: string;
  type: EvidenceType;
  fileFormat: string;
  fileSizeBytes: number;
  sha256Hash: string;
  originalFileName: string;
  storageLocation: string;
  storageReference?: string;
  detectedMediaType?: string;
  capturedBy: string;
  capturedAt: string;
  integrityStatus: IntegrityStatus;
  lastIntegrityCheck: string;
  tags: string[];
  thumbnailUrl?: string;
  notes?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ChainOfCustodyRecord {
  id: string;
  evidenceId: string;
  evidenceNumber: string;
  caseId?: string;
  caseNumber: string;
  eventType?: string;
  action: 'Collected' | 'Received' | 'Custodian Assigned' | 'Transferred' | 'Checked Out' | 'Returned' | 'Stored in Vault' | 'Sealed' | 'Accessed / Inspected' | 'Analysed' | 'Correction Event' | string;
  performedBy: string;
  badgeNumber: string;
  actingUser?: {
    id?: string;
    name?: string;
    badge?: string;
    email?: string;
    role?: string;
  };
  previousCustodian?: {
    name?: string;
    badge?: string;
    role?: string;
    organization?: string;
  } | null;
  newCustodian?: {
    name?: string;
    badge?: string;
    role?: string;
    organization?: string;
  } | null;
  recipient?: string;
  recipientBadge?: string;
  reason: string;
  location: string;
  notes?: string;
  timestamp: string;
  evidenceSha256?: string;
  sequenceNumber?: number;
  blockHash: string;
  previousBlockHash: string;
  digitalSignature: string;
  verified: boolean;
  isCorrection?: boolean;
  correctedEventId?: string;
  correctionReason?: string;
}

// AI Analysis Types
export type AnalysisCategory = 'image_forgery' | 'fingerprint_minutiae' | 'face_verification' | 'sketch_to_photo';

export interface BaseAnalysisResult {
  analysisId: string;
  evidenceId: string;
  category: AnalysisCategory;
  modelEngine: string;
  modelVersion: string;
  processingTimeMs: number;
  timestamp: string;
  status: 'completed' | 'failed' | 'processing';
  confidenceScore: number; // 0 - 100
  analystNotes?: string;
}

export interface ImageAnalysisData extends BaseAnalysisResult {
  category: 'image_forgery';
  elaScore: number; // Error Level Analysis divergence
  noiseInconsistency: number;
  cloningDetected: boolean;
  metadataTampered: boolean;
  suspiciousRegions: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
  compressionArtifacts: 'uniform' | 'heterogeneous' | 'recompressed';
}

export interface FingerprintAnalysisData extends BaseAnalysisResult {
  category: 'fingerprint_minutiae';
  patternType: 'whorl' | 'left_loop' | 'right_loop' | 'arch' | 'tented_arch';
  minutiaeCount: number;
  ridgeQualityScore: number;
  candidateMatches: Array<{
    candidateId: string;
    subjectName: string;
    afisScore: number;
    matchCount: number;
  }>;
}

export interface FaceAnalysisData extends BaseAnalysisResult {
  category: 'face_verification';
  faceDetected: boolean;
  landmarksCount: number;
  similarityScore: number;
  poseAngle: { yaw: number; pitch: number; roll: number };
  spoofingDetected: boolean;
  matchedProfiles: Array<{
    profileId: string;
    name: string;
    matchScore: number;
    databaseSource: string;
  }>;
}

export interface SketchAnalysisData extends BaseAnalysisResult {
  category: 'sketch_to_photo';
  syntheticMatchScore: number;
  featureSimilarity: {
    eyes: number;
    nose: number;
    jawline: number;
    mouth: number;
  };
  retrievedPhotographs: Array<{
    photoId: string;
    personName: string;
    similarityRank: number;
    confidence: number;
  }>;
}

// Notification & Activity Types
export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'security' | 'case' | 'evidence' | 'system';
  priority: 'info' | 'warning' | 'urgent';
  read: boolean;
  link?: string;
}

export interface ActivityLog {
  id: string;
  actor: string | { name?: string; badge?: string; badge_number?: string; email?: string; id?: string; role?: string };
  badge?: string;
  action: string;
  target: string;
  targetType: 'case' | 'evidence' | 'custody' | 'analysis' | 'user' | string;
  timestamp: string;
  ipAddress: string;
}

// Forensic Report Types
export interface ForensicReport {
  id: string;
  reportNumber: string;
  title: string;
  caseId: string;
  caseNumber: string;
  author: string;
  createdAt: string;
  classification: 'CONFIDENTIAL' | 'RESTRICTED' | 'OFFICIAL COURT EXHIBIT';
  status: 'draft' | 'finalized' | 'submitted';
  hashDigest: string;
  fileSizeBytes: number;
}
