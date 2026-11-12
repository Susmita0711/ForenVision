import type { 
  ForensicCase, 
  EvidenceItem, 
  ChainOfCustodyRecord, 
  User, 
  SystemNotification, 
  ActivityLog,
  ForensicReport,
  ImageAnalysisData,
  FingerprintAnalysisData,
  FaceAnalysisData,
  SketchAnalysisData
} from '../types';

export const DEV_FIXTURE_NOTICE = 'DEVELOPMENT FIXTURE DATA — LOCAL SECURE SIMULATION';

export const initialCurrentUser: User = {
  id: 'usr_lead_01',
  badgeNumber: 'FX-8842',
  name: 'Agent Sarah Vance',
  email: 's.vance@forenvision.internal',
  role: 'lead_examiner',
  department: 'Digital Forensic Integrity Division',
  lastActive: '2026-10-17 20:30:12 UTC',
  status: 'active',
  avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=256'
};

export const devUsers: User[] = [
  initialCurrentUser,
  {
    id: 'usr_analyst_02',
    badgeNumber: 'FX-9104',
    name: 'Dr. Marcus Sterling',
    email: 'm.sterling@forenvision.internal',
    role: 'analyst',
    department: 'Computer Vision & ELA Diagnostics',
    lastActive: '2026-10-17 19:44:00 UTC',
    status: 'active',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=256'
  },
  {
    id: 'usr_inv_03',
    badgeNumber: 'FX-7621',
    name: 'Det. Evelyn Reed',
    email: 'e.reed@forenvision.internal',
    role: 'investigator',
    department: 'Cyber Financial Crimes Unit',
    lastActive: '2026-10-17 18:15:20 UTC',
    status: 'active',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256'
  },
  {
    id: 'usr_admin_04',
    badgeNumber: 'FX-1001',
    name: 'Dir. Nathan Frost',
    email: 'n.frost@forenvision.internal',
    role: 'admin',
    department: 'Forensic System Operations',
    lastActive: '2026-10-17 17:02:11 UTC',
    status: 'active'
  },
  {
    id: 'usr_tech_05',
    badgeNumber: 'FX-4490',
    name: 'Tech Lucas Meyer',
    email: 'l.meyer@forenvision.internal',
    role: 'technician',
    department: 'Biometric Evidence Intake',
    lastActive: '2026-10-16 14:22:45 UTC',
    status: 'suspended'
  }
];

export const devCases: ForensicCase[] = [
  {
    id: 'case_001',
    caseNumber: 'CAS-2026-8812',
    title: 'Operation Spectral Gate: Altered Wire Transfer Receipts',
    description: 'Investigation into fabricated banking ledger receipts and altered digital image stamps during suspected unauthorized international capital flight.',
    incidentType: 'Digital Forgery',
    status: 'open',
    priority: 'critical',
    leadInvestigator: 'Agent Sarah Vance (FX-8842)',
    assignedExaminers: ['Dr. Marcus Sterling (FX-9104)', 'Det. Evelyn Reed (FX-7621)'],
    evidenceCount: 6,
    chainOfCustodyCount: 14,
    createdAt: '2026-10-12 09:15:00 UTC',
    updatedAt: '2026-10-17 16:30:00 UTC',
    tags: ['Bank Fraud', 'ELA Analysis', 'High-Profile', 'Cryptographic Custody']
  },
  {
    id: 'case_002',
    caseNumber: 'CAS-2026-8813',
    title: 'Substation Perimeter Tampering & Latent Ridge Capture',
    description: 'Physical security breach at northern power distribution terminal with recovered latent fingerprints from access bypass terminal.',
    incidentType: 'Biometric Match',
    status: 'in_progress',
    priority: 'high',
    leadInvestigator: 'Det. Evelyn Reed (FX-7621)',
    assignedExaminers: ['Agent Sarah Vance (FX-8842)'],
    evidenceCount: 4,
    chainOfCustodyCount: 9,
    createdAt: '2026-10-14 11:40:00 UTC',
    updatedAt: '2026-10-17 14:10:00 UTC',
    tags: ['Critical Infrastructure', 'AFIS Latent', 'Biometrics']
  },
  {
    id: 'case_003',
    caseNumber: 'CAS-2026-8809',
    title: 'Executive Deepfake Extortion & Metadata Sanitization',
    description: 'Targeted spear-phishing attack accompanied by manipulated synthetic facial video targeting corporate board members.',
    incidentType: 'Cyber Crime',
    status: 'under_review',
    priority: 'high',
    leadInvestigator: 'Dr. Marcus Sterling (FX-9104)',
    assignedExaminers: ['Agent Sarah Vance (FX-8842)'],
    evidenceCount: 8,
    chainOfCustodyCount: 19,
    createdAt: '2026-10-09 14:00:00 UTC',
    updatedAt: '2026-10-16 18:22:00 UTC',
    tags: ['Deepfake', 'Face Verification', 'Sanitized EXIF']
  },
  {
    id: 'case_004',
    caseNumber: 'CAS-2026-8798',
    title: 'Eyewitness Composite Matching: Transit Hub Robbery',
    description: 'Forensic sketch comparison against regional arrest photo registry following armed robbery at Central Transit concourse.',
    incidentType: 'Identity Theft',
    status: 'in_progress',
    priority: 'medium',
    leadInvestigator: 'Det. Evelyn Reed (FX-7621)',
    assignedExaminers: ['Tech Lucas Meyer (FX-4490)'],
    evidenceCount: 3,
    chainOfCustodyCount: 6,
    createdAt: '2026-10-05 08:30:00 UTC',
    updatedAt: '2026-10-15 10:15:00 UTC',
    tags: ['Composite Sketch', 'Facial Landmark', 'Witness Testimony']
  },
  {
    id: 'case_005',
    caseNumber: 'CAS-2026-8750',
    title: 'Archived: State vs. H. Sterling Ransomware Exfiltration',
    description: 'Court-adjudicated cyber incident involving memory dumps and encrypted volumes. Admitted as key state exhibit #4.',
    incidentType: 'Cyber Crime',
    status: 'closed',
    priority: 'low',
    leadInvestigator: 'Agent Sarah Vance (FX-8842)',
    assignedExaminers: ['Dr. Marcus Sterling (FX-9104)'],
    evidenceCount: 12,
    chainOfCustodyCount: 28,
    createdAt: '2026-08-11 10:00:00 UTC',
    updatedAt: '2026-09-30 17:00:00 UTC',
    closedAt: '2026-09-30 17:00:00 UTC',
    tags: ['Adjudicated', 'Archived', 'Court Admitted']
  }
];

export const devEvidence: EvidenceItem[] = [
  {
    id: 'evd_001',
    caseId: 'case_001',
    caseNumber: 'CAS-2026-8812',
    evidenceNumber: 'EVD-4091',
    name: 'SWIFT Transfer Voucher Scan 091-B.png',
    type: 'image',
    fileFormat: 'PNG',
    fileSizeBytes: 4892140,
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    originalFileName: 'swift_receipt_oct12_raw.png',
    storageLocation: 'Vault Tier-1 Secure NAS /CAS-2026-8812/EVD-4091',
    capturedBy: 'Det. Evelyn Reed',
    capturedAt: '2026-10-12 10:14:22 UTC',
    integrityStatus: 'tampered',
    lastIntegrityCheck: '2026-10-17 19:00:00 UTC',
    tags: ['Financial Receipt', 'ELA High Discrepancy', 'Splice Point'],
    thumbnailUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=600',
    notes: 'ELA scan shows compression divergence around amount field ($4.2M). Digital watermark was removed.'
  },
  {
    id: 'evd_002',
    caseId: 'case_002',
    caseNumber: 'CAS-2026-8813',
    evidenceNumber: 'EVD-4092',
    name: 'Latent Print Lift - Access Keypad #3',
    type: 'fingerprint',
    fileFormat: 'TIFF (1000 DPI)',
    fileSizeBytes: 12450320,
    sha256Hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    originalFileName: 'keypad_lift_03_hi-res.tiff',
    storageLocation: 'Vault Tier-1 Biometric Cold Store /CAS-2026-8813/EVD-4092',
    capturedBy: 'Tech Lucas Meyer',
    capturedAt: '2026-10-14 12:45:10 UTC',
    integrityStatus: 'verified',
    lastIntegrityCheck: '2026-10-17 18:30:00 UTC',
    tags: ['AFIS Latent', 'Right Index', 'Minutiae Verified'],
    thumbnailUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=600',
    notes: 'Cyanoacrylate fuming lift. 42 distinct minutiae landmarks extracted.'
  },
  {
    id: 'evd_003',
    caseId: 'case_003',
    caseNumber: 'CAS-2026-8809',
    evidenceNumber: 'EVD-4093',
    name: 'CCTV High-Definition Frame Capture 14:02:18',
    type: 'face',
    fileFormat: 'JPEG',
    fileSizeBytes: 3120900,
    sha256Hash: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    originalFileName: 'concourse_cam_08_frame7812.jpg',
    storageLocation: 'Vault Tier-2 High-Speed Array /CAS-2026-8809/EVD-4093',
    capturedBy: 'Agent Sarah Vance',
    capturedAt: '2026-10-09 16:20:00 UTC',
    integrityStatus: 'verified',
    lastIntegrityCheck: '2026-10-17 17:15:00 UTC',
    tags: ['Facial Recognition', 'Surveillance Extraction', 'Angle Corrected'],
    thumbnailUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600',
    notes: 'Extracted from 4K Sony IP camera. 68 3D landmark points calculated.'
  },
  {
    id: 'evd_004',
    caseId: 'case_004',
    caseNumber: 'CAS-2026-8798',
    evidenceNumber: 'EVD-4094',
    name: 'Certified Witness Composite Pencil Drawing',
    type: 'sketch',
    fileFormat: 'PNG (Direct Scan)',
    fileSizeBytes: 7812300,
    sha256Hash: '9876543210abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    originalFileName: 'artist_composite_sketch_04.png',
    storageLocation: 'Physical Evidence Room / Locker 4B & Digital Mirror',
    capturedBy: 'Det. Evelyn Reed',
    capturedAt: '2026-10-05 11:00:00 UTC',
    integrityStatus: 'verified',
    lastIntegrityCheck: '2026-10-16 09:00:00 UTC',
    tags: ['Forensic Artist', 'Composite Sketch', 'Pre-AI Search'],
    thumbnailUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&q=80&w=600',
    notes: 'Drawn under cognitive interview protocol with two corroborated witnesses.'
  },
  {
    id: 'evd_005',
    caseId: 'case_001',
    caseNumber: 'CAS-2026-8812',
    evidenceNumber: 'EVD-4095',
    name: 'Tampered Executive Signature Block.jpg',
    type: 'image',
    fileFormat: 'JPEG',
    fileSizeBytes: 2198000,
    sha256Hash: '7c8b9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c',
    originalFileName: 'exec_signature_cutout.jpg',
    storageLocation: 'Vault Tier-1 Secure NAS /CAS-2026-8812/EVD-4095',
    capturedBy: 'Dr. Marcus Sterling',
    capturedAt: '2026-10-13 15:40:00 UTC',
    integrityStatus: 'tampered',
    lastIntegrityCheck: '2026-10-17 19:10:00 UTC',
    tags: ['Signature Forgery', 'Noise Discontinuity'],
    thumbnailUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&q=80&w=600',
    notes: 'Cloning detector flagged repeating stroke patterns consistent with copy-move artifact.'
  }
];

export const devChainOfCustody: ChainOfCustodyRecord[] = [
  {
    id: 'coc_001',
    evidenceId: 'evd_001',
    evidenceNumber: 'EVD-4091',
    caseNumber: 'CAS-2026-8812',
    action: 'Collected',
    performedBy: 'Det. Evelyn Reed',
    badgeNumber: 'FX-7621',
    reason: 'Initial forensic seizure from compromised terminal workstation',
    location: 'Metropolitan Financial Tower, Suite 400',
    timestamp: '2026-10-12 10:14:22 UTC',
    blockHash: '0000a4b7c89f1d2e3c4b5a6f7e8d9c0b1a2e3f4d5c6b7a8f9e0d1c2b3a4f5e6d',
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    digitalSignature: 'SIG_RSA4096_7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c',
    verified: true
  },
  {
    id: 'coc_002',
    evidenceId: 'evd_001',
    evidenceNumber: 'EVD-4091',
    caseNumber: 'CAS-2026-8812',
    action: 'Transferred',
    performedBy: 'Det. Evelyn Reed',
    badgeNumber: 'FX-7621',
    recipient: 'Dr. Marcus Sterling',
    recipientBadge: 'FX-9104',
    reason: 'Secure intake into Forensic Lab Vault & SHA-256 baseline hashing',
    location: 'Forensic Lab Intake Station B',
    timestamp: '2026-10-12 12:30:00 UTC',
    blockHash: '0000b5c8d90e2f3a4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e',
    previousBlockHash: '0000a4b7c89f1d2e3c4b5a6f7e8d9c0b1a2e3f4d5c6b7a8f9e0d1c2b3a4f5e6d',
    digitalSignature: 'SIG_RSA4096_8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
    verified: true
  },
  {
    id: 'coc_003',
    evidenceId: 'evd_001',
    evidenceNumber: 'EVD-4091',
    caseNumber: 'CAS-2026-8812',
    action: 'Analysed',
    performedBy: 'Dr. Marcus Sterling',
    badgeNumber: 'FX-9104',
    reason: 'Executed Error Level Analysis (ELA) and DCT quantization map extraction',
    location: 'ELA Computer Vision Terminal Alpha',
    timestamp: '2026-10-13 14:15:30 UTC',
    blockHash: '0000c6d9e01f3a4b5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0b1a2e3f4d5c6b7a8f',
    previousBlockHash: '0000b5c8d90e2f3a4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7e',
    digitalSignature: 'SIG_RSA4096_9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e',
    verified: true
  },
  {
    id: 'coc_004',
    evidenceId: 'evd_002',
    evidenceNumber: 'EVD-4092',
    caseNumber: 'CAS-2026-8813',
    action: 'Collected',
    performedBy: 'Tech Lucas Meyer',
    badgeNumber: 'FX-4490',
    reason: 'Latent fingerprint lift at keypad enclosure exterior',
    location: 'Northern Power Substation Perimeter Gate',
    timestamp: '2026-10-14 12:45:10 UTC',
    blockHash: '0000d7e0f12a4b5c6f7e8d9c0b1a2e3f4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a',
    previousBlockHash: '0000000000000000000000000000000000000000000000000000000000000000',
    digitalSignature: 'SIG_RSA4096_0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f',
    verified: true
  }
];

export const devImageAnalysis: ImageAnalysisData = {
  analysisId: 'ana_img_9910',
  evidenceId: 'evd_001',
  category: 'image_forgery',
  modelEngine: 'ForenVision-ELA-CNN (v3.2)',
  modelVersion: '3.2.1-production',
  processingTimeMs: 1420,
  timestamp: '2026-10-17 19:02:14 UTC',
  status: 'completed',
  confidenceScore: 94.6,
  elaScore: 88.4,
  noiseInconsistency: 79.2,
  cloningDetected: true,
  metadataTampered: true,
  compressionArtifacts: 'heterogeneous',
  suspiciousRegions: [
    { x: 320, y: 410, width: 210, height: 75, confidence: 96.8 },
    { x: 540, y: 780, width: 180, height: 60, confidence: 89.2 }
  ],
  analystNotes: 'Strong compression gradient anomaly detected in amount block. EXIF software tag indicates Adobe Photoshop 25.1.0 modification prior to PNG export.'
};

export const devFingerprintAnalysis: FingerprintAnalysisData = {
  analysisId: 'ana_fp_8812',
  evidenceId: 'evd_002',
  category: 'fingerprint_minutiae',
  modelEngine: 'DeepMinutiae-AFIS (v4.0)',
  modelVersion: '4.0.8-secure',
  processingTimeMs: 870,
  timestamp: '2026-10-17 18:35:10 UTC',
  status: 'completed',
  confidenceScore: 91.2,
  patternType: 'right_loop',
  minutiaeCount: 42,
  ridgeQualityScore: 84.5,
  candidateMatches: [
    { candidateId: 'AFIS-9921', subjectName: 'Dominic Kane (DOB: 1988-04-12)', afisScore: 94.2, matchCount: 38 },
    { candidateId: 'AFIS-4019', subjectName: 'Jason R. Cole (DOB: 1991-11-03)', afisScore: 61.5, matchCount: 22 },
    { candidateId: 'AFIS-1102', subjectName: 'Raymond Miller (DOB: 1984-07-29)', afisScore: 47.0, matchCount: 14 }
  ],
  analystNotes: 'Clear core and delta detected. Candidate AFIS-9921 exhibits high topological correspondence with 38 matching bifurcation and ridge ending points.'
};

export const devFaceAnalysis: FaceAnalysisData = {
  analysisId: 'ana_face_7714',
  evidenceId: 'evd_003',
  category: 'face_verification',
  modelEngine: 'ArcFace-ForensicNet (v5.1)',
  modelVersion: '5.1.0-forensic',
  processingTimeMs: 1120,
  timestamp: '2026-10-17 17:20:00 UTC',
  status: 'completed',
  confidenceScore: 89.7,
  faceDetected: true,
  landmarksCount: 68,
  similarityScore: 89.7,
  poseAngle: { yaw: 4.2, pitch: -2.1, roll: 0.8 },
  spoofingDetected: false,
  matchedProfiles: [
    { profileId: 'PR-8819', name: 'Dominic Kane', matchScore: 91.4, databaseSource: 'Regional Warrant Registry' },
    { profileId: 'PR-3042', name: 'Darren Cross', matchScore: 64.1, databaseSource: 'State DMV Database' }
  ],
  analystNotes: 'No deepfake warp or synthetic blending artifacts detected. Angle of incidence within permissible forensic tolerance (< 15 degrees).'
};

export const devSketchAnalysis: SketchAnalysisData = {
  analysisId: 'ana_sketch_6619',
  evidenceId: 'evd_004',
  category: 'sketch_to_photo',
  modelEngine: 'PhotoSynthetic-GAN (v2.4)',
  modelVersion: '2.4.2-eval',
  processingTimeMs: 2340,
  timestamp: '2026-10-16 09:20:10 UTC',
  status: 'completed',
  confidenceScore: 82.5,
  syntheticMatchScore: 83.1,
  featureSimilarity: {
    eyes: 88.0,
    nose: 81.5,
    jawline: 85.0,
    mouth: 76.2
  },
  retrievedPhotographs: [
    { photoId: 'MUG-9021', personName: 'Person of Interest #402', similarityRank: 1, confidence: 84.6 },
    { photoId: 'MUG-4418', personName: 'Subject Delta-9', similarityRank: 2, confidence: 78.1 },
    { photoId: 'MUG-1205', personName: 'Subject Zeta-3', similarityRank: 3, confidence: 69.3 }
  ],
  analystNotes: 'Pencil composite translated into photorealistic latent representation. Strong bilateral match on nasal bridge and mandibular jaw angles.'
};

export const devNotifications: SystemNotification[] = [
  {
    id: 'notif_001',
    title: 'SHA-256 Integrity Anomaly Flagged',
    message: 'Evidence EVD-4091 in Case CAS-2026-8812 exhibited cryptographic hash mismatch against intake registry.',
    timestamp: '12 minutes ago',
    type: 'security',
    priority: 'urgent',
    read: false,
    link: '/evidence/evd_001'
  },
  {
    id: 'notif_002',
    title: 'New Biometric Match Registered',
    message: 'AFIS-9921 matched latent print EVD-4092 with 94.2% topological alignment.',
    timestamp: '1 hour ago',
    type: 'evidence',
    priority: 'warning',
    read: false,
    link: '/analysis/fingerprint'
  },
  {
    id: 'notif_003',
    title: 'Chain of Custody Handover Logged',
    message: 'Record #COC-003 cryptographically signed by Dr. Marcus Sterling (FX-9104).',
    timestamp: '3 hours ago',
    type: 'case',
    priority: 'info',
    read: true,
    link: '/chain-of-custody'
  },
  {
    id: 'notif_004',
    title: 'Automated Cold Vault Backup Complete',
    message: '14.8 GB of encrypted forensic archives replicated to Secondary Disaster Vault.',
    timestamp: '5 hours ago',
    type: 'system',
    priority: 'info',
    read: true,
    link: '/settings'
  }
];

export const devActivityLogs: ActivityLog[] = [
  {
    id: 'act_001',
    actor: 'Agent Sarah Vance',
    badge: 'FX-8842',
    action: 'Verified Cryptographic Chain of Custody',
    target: 'CAS-2026-8812',
    targetType: 'custody',
    timestamp: '2026-10-17 20:15:30 UTC',
    ipAddress: '10.240.12.88'
  },
  {
    id: 'act_002',
    actor: 'Dr. Marcus Sterling',
    badge: 'FX-9104',
    action: 'Ran Error Level Analysis (ELA)',
    target: 'EVD-4091 (Wire Transfer Voucher)',
    targetType: 'analysis',
    timestamp: '2026-10-17 19:02:14 UTC',
    ipAddress: '10.240.12.92'
  },
  {
    id: 'act_003',
    actor: 'Det. Evelyn Reed',
    badge: 'FX-7621',
    action: 'Transferred Latent Evidence to Lab',
    target: 'EVD-4092',
    targetType: 'evidence',
    timestamp: '2026-10-17 18:30:00 UTC',
    ipAddress: '10.240.14.15'
  },
  {
    id: 'act_004',
    actor: 'Dir. Nathan Frost',
    badge: 'FX-1001',
    action: 'Generated Court-Admissible Dossier',
    target: 'REP-2026-091',
    targetType: 'case',
    timestamp: '2026-10-17 16:45:00 UTC',
    ipAddress: '10.240.10.2'
  }
];

export const devReports: ForensicReport[] = [
  {
    id: 'rep_001',
    reportNumber: 'REP-2026-091',
    title: 'Comprehensive Image Forgery & ELA Audit - Wire Transfer Voucher',
    caseId: 'case_001',
    caseNumber: 'CAS-2026-8812',
    author: 'Dr. Marcus Sterling (FX-9104)',
    createdAt: '2026-10-17 19:30:00 UTC',
    classification: 'OFFICIAL COURT EXHIBIT',
    status: 'finalized',
    hashDigest: '4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b',
    fileSizeBytes: 3419000
  },
  {
    id: 'rep_002',
    reportNumber: 'REP-2026-088',
    title: 'AFIS Minutiae Verification: Keypad Latent vs Dominic Kane',
    caseId: 'case_002',
    caseNumber: 'CAS-2026-8813',
    author: 'Agent Sarah Vance (FX-8842)',
    createdAt: '2026-10-16 14:10:00 UTC',
    classification: 'CONFIDENTIAL',
    status: 'draft',
    hashDigest: '9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e',
    fileSizeBytes: 1845000
  },
  {
    id: 'rep_003',
    reportNumber: 'REP-2026-072',
    title: 'Adjudication Dossier: Digital Evidence Chain of Custody Validation',
    caseId: 'case_005',
    caseNumber: 'CAS-2026-8750',
    author: 'Dir. Nathan Frost (FX-1001)',
    createdAt: '2026-09-29 11:00:00 UTC',
    classification: 'RESTRICTED',
    status: 'submitted',
    hashDigest: '11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff',
    fileSizeBytes: 8940000
  }
];
