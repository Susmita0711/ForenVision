"""
Forensic Operations Analytics & Telemetry Service for ForenVision AI.
Computes real database-backed aggregations across cases, evidence vault records,
multi-modal analysis jobs, chain of custody logs, and court exhibit reports.

FORENSIC PRINCIPLES:
1. Zero Fabrication: Real database records only. Empty states return 0/[] without mock numbers.
2. Confidentiality & RBAC: Aggregations respect case-level access control. Never leaks confidential
   case titles or restricted docket details in workload summaries.
3. Separation of Confidence vs. Accuracy: Algorithmic model confidence is explicitly documented
   as mathematical probability under training parameters, NEVER forensic accuracy or legal proof.
4. Flexible Date Filtering: Supports presets (7d, 30d, 90d, 1y, all) and ISO date ranges.
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from pymongo.errors import PyMongoError

from services.db import db_service
from services.case_service import case_service
from services.evidence_service import evidence_service
from services.report_service import report_service
from services.user_service import user_service
from services.image_forensics_service import image_forensics_service
from services.object_detection_service import object_detection_service
from services.fingerprint_service import fingerprint_service
from services.face_analysis_service import face_analysis_service
from services.sketch_service import sketch_service


METRIC_DEFINITIONS: Dict[str, str] = {
    "casesByStatus": (
        "Aggregation of authorized investigation dockets grouped by administrative workflow lifecycle "
        "(e.g., Active, In Progress, Under Review, Closed, Cold Case). Reflects current caseload balance."
    ),
    "casesOverTime": (
        "Chronological trajectory of formal case intakes initiated within the designated calendar window, "
        "tracking agency casework intake velocity."
    ),
    "evidenceByType": (
        "Distribution of physical and digital evidentiary exhibits ingested into the secure vault, "
        "categorized by verified MIME media type (Image, Video, Audio, Document, Binary Artifact)."
    ),
    "evidenceIngestionOverTime": (
        "Temporal audit of evidence ingestion transactions, tracking daily exhibit volume registered "
        "and hashed with SHA-256 upon intake."
    ),
    "analysisJobsByStatus": (
        "Execution lifecycle states of automated diagnostic tasks (Completed, Pending, In Progress, Failed) "
        "across all computer vision and biometric examination engines."
    ),
    "processingTimes": (
        "Empirical compute execution elapsed times in milliseconds recorded during model inference or algorithmic "
        "processing (e.g. OpenCV ELA recompression, YOLO detection, SIFT-RANSAC minutiae matching). Zero synthetic extrapolation."
    ),
    "reportGenerationActivity": (
        "Volume of official court exhibit dossiers compiled, sealed with SHA-256 digital digests, and archived "
        "categorized by evidentiary classification level."
    ),
    "investigatorWorkload": (
        "Caseload allocation per certified examiner, showing active vs. resolved assignments. "
        "Restricted to authorized supervisory personnel and anonymized to prevent operational disclosure."
    ),
    "forensicAccuracyNotice": (
        "SCIENTIFIC & LEGAL INVARIANT: Algorithmic confidence scores (such as neural bounding-box probabilities "
        "or facial embedding cosine similarities) measure mathematical pattern correspondence within statistical models. "
        "In accordance with OSAC, NIST, and Federal Rules of Evidence (FRE 702 / Daubert), algorithmic confidence does NOT "
        "constitute forensic accuracy, individualization certainty, or autonomous legal proof of guilt."
    ),
}


def parse_iso_datetime(dt_str: Any) -> Optional[datetime]:
    """Parse various ISO format strings into UTC timezone-aware datetime."""
    if not dt_str:
        return None
    if isinstance(dt_str, datetime):
        if dt_str.tzinfo is None:
            return dt_str.replace(tzinfo=timezone.utc)
        return dt_str.astimezone(timezone.utc)

    s = str(dt_str).strip()
    # Handle YYYY-MM-DD
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        try:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # Handle standard ISO strings
    try:
        # Replace trailing Z with UTC offset
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


class AnalyticsService:
    """Service computing database-backed operational and forensic telemetry."""

    def parse_date_range(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        preset: Optional[str] = "30d",
    ) -> Tuple[Optional[datetime], Optional[datetime], str]:
        """
        Resolve date range from explicit ISO parameters or presets ('7d', '30d', '90d', '1y', 'all').
        Returns (start_dt, end_dt, active_preset_label).
        """
        now = datetime.now(timezone.utc)

        # 1. Custom ISO date range provided
        if start_date:
            parsed_start = parse_iso_datetime(start_date)
            parsed_end = parse_iso_datetime(end_date) if end_date else now
            if parsed_start:
                # Ensure end date covers full day if only date provided
                if end_date and len(end_date) == 10:
                    parsed_end = parsed_end.replace(hour=23, minute=59, second=59, microsecond=999999)
                return parsed_start, parsed_end, "custom"

        # 2. Preset Range
        active_preset = (preset or "30d").lower()
        if active_preset == "7d":
            return now - timedelta(days=7), now, "7d"
        elif active_preset == "30d":
            return now - timedelta(days=30), now, "30d"
        elif active_preset == "90d":
            return now - timedelta(days=90), now, "90d"
        elif active_preset in ("1y", "365d"):
            return now - timedelta(days=365), now, "1y"
        elif active_preset == "all":
            return None, now, "all"
        else:
            # Default to 30d
            return now - timedelta(days=30), now, "30d"

    def get_overview_analytics(
        self,
        user: Dict[str, Any],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        preset: Optional[str] = "30d",
    ) -> Dict[str, Any]:
        """
        Calculate complete database-backed forensic analytics:
        - Cases by status
        - Cases created over time
        - Evidence by type
        - Evidence ingestion over time
        - Analysis jobs by status
        - Processing times (when recorded)
        - Report-generation activity
        - Investigator workload (with authorization guard)
        """
        start_dt, end_dt, range_label = self.parse_date_range(start_date, end_date, preset)

        # 1. Cases Aggregation (Authorized for user)
        cases_data = self._aggregate_cases(user, start_dt, end_dt)

        # 2. Evidence Aggregation (Authorized for user)
        evidence_data = self._aggregate_evidence(user, start_dt, end_dt)

        # 3. Analysis Jobs & Processing Times Aggregation
        analysis_data = self._aggregate_analyses(user, start_dt, end_dt)

        # 4. Report-Generation Activity
        reports_data = self._aggregate_reports(user, start_dt, end_dt)

        # 5. Investigator Workload (Protected with RBAC)
        workload_data = self._aggregate_investigator_workload(user, start_dt, end_dt)

        # 6. Verified Trained Model Benchmarks & Real Live Detection Confidence Stats
        model_accuracy_data = self._aggregate_model_benchmarks_and_detections(
            analysis_data.get("filteredAnalyses", [])
        )

        return {
            "dateRange": {
                "preset": range_label,
                "startDate": start_dt.isoformat() if start_dt else None,
                "endDate": end_dt.isoformat() if end_dt else None,
            },
            "casesByStatus": cases_data["byStatus"],
            "casesOverTime": cases_data["overTime"],
            "totalCasesInRange": cases_data["totalInRange"],
            "evidenceByType": evidence_data["byType"],
            "evidenceIngestionOverTime": evidence_data["overTime"],
            "totalEvidenceInRange": evidence_data["totalInRange"],
            "analysisJobsByStatus": analysis_data["jobsByStatus"],
            "processingTimes": analysis_data["processingTimes"],
            "totalAnalysesInRange": analysis_data["totalInRange"],
            "reportGeneration": reports_data,
            "investigatorWorkload": workload_data,
            "modelAccuracyAndDetections": model_accuracy_data,
            "metricDefinitions": METRIC_DEFINITIONS,
        }

    # -------------------------------------------------------------------------
    # Internal Aggregators
    # -------------------------------------------------------------------------

    def _aggregate_cases(
        self,
        user: Dict[str, Any],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> Dict[str, Any]:
        """Aggregate case status breakdown and intake velocity over time."""
        # 1. Fetch authorized cases honoring case-level clearance
        authorized_cases = case_service.list_authorized_cases(user)

        # 2. Filter by date range
        in_range_cases: List[Dict[str, Any]] = []
        for c in authorized_cases:
            c_dt = parse_iso_datetime(c.get("createdAt"))
            if c_dt:
                if start_dt and c_dt < start_dt:
                    continue
                if end_dt and c_dt > end_dt:
                    continue
                in_range_cases.append(c)
            elif not start_dt:
                in_range_cases.append(c)

        # Status counts
        status_counts: Dict[str, int] = {}
        # Date counts (YYYY-MM-DD)
        date_counts: Dict[str, int] = {}

        for c in in_range_cases:
            status = str(c.get("status", "ACTIVE")).upper()
            status_counts[status] = status_counts.get(status, 0) + 1

            c_dt = parse_iso_datetime(c.get("createdAt"))
            if c_dt:
                day_key = c_dt.strftime("%Y-%m-%d")
                date_counts[day_key] = date_counts.get(day_key, 0) + 1

        # Format casesByStatus
        STATUS_COLORS = {
            "OPEN": "#06B6D4",
            "ACTIVE": "#3B82F6",
            "IN_PROGRESS": "#3B82F6",
            "UNDER_REVIEW": "#A855F7",
            "CLOSED": "#10B981",
            "ARCHIVED": "#64748B",
            "COLD": "#64748B",
        }

        by_status = [
            {
                "status": s,
                "count": cnt,
                "color": STATUS_COLORS.get(s, "#38BDF8"),
            }
            for s, cnt in sorted(status_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        # Format casesOverTime sorted chronologically
        over_time = [
            {"date": d, "count": cnt}
            for d, cnt in sorted(date_counts.items(), key=lambda x: x[0])
        ]

        return {
            "byStatus": by_status,
            "overTime": over_time,
            "totalInRange": len(in_range_cases),
        }

    def _aggregate_evidence(
        self,
        user: Dict[str, Any],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> Dict[str, Any]:
        """Aggregate evidence distribution by media type and intake over time."""
        accessible_res = evidence_service.list_accessible_evidence(user, limit=2000)
        evidence_list = accessible_res.get("evidence", [])

        in_range_evidence: List[Dict[str, Any]] = []
        for ev in evidence_list:
            ev_dt = parse_iso_datetime(ev.get("uploadedAt"))
            if ev_dt:
                if start_dt and ev_dt < start_dt:
                    continue
                if end_dt and ev_dt > end_dt:
                    continue
                in_range_evidence.append(ev)
            elif not start_dt:
                in_range_evidence.append(ev)

        type_counts: Dict[str, int] = {}
        date_counts: Dict[str, int] = {}

        for ev in in_range_evidence:
            ev_type = str(ev.get("type", "image")).lower()
            type_counts[ev_type] = type_counts.get(ev_type, 0) + 1

            ev_dt = parse_iso_datetime(ev.get("uploadedAt"))
            if ev_dt:
                day_key = ev_dt.strftime("%Y-%m-%d")
                date_counts[day_key] = date_counts.get(day_key, 0) + 1

        TYPE_COLORS = {
            "image": "#06B6D4",
            "video": "#3B82F6",
            "audio": "#8B5CF6",
            "document": "#10B981",
            "pdf": "#F59E0B",
            "binary": "#64748B",
            "other": "#94A3B8",
        }

        by_type = [
            {
                "type": t,
                "count": cnt,
                "color": TYPE_COLORS.get(t, "#38BDF8"),
            }
            for t, cnt in sorted(type_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        over_time = [
            {"date": d, "count": cnt}
            for d, cnt in sorted(date_counts.items(), key=lambda x: x[0])
        ]

        return {
            "byType": by_type,
            "overTime": over_time,
            "totalInRange": len(in_range_evidence),
        }

    def _aggregate_analyses(
        self,
        user: Dict[str, Any],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> Dict[str, Any]:
        """Aggregate analysis jobs by status and recorded execution latency in ms."""
        all_analyses: List[Dict[str, Any]] = []

        # 1. MongoDB Query if available
        db = db_service.get_db()
        if db is not None:
            try:
                cursor = db["analysis_results"].find().sort("timestamp", -1)
                for doc in cursor:
                    doc["id"] = str(doc.get("id") or doc.get("analysisId") or doc.get("_id"))
                    doc.pop("_id", None)
                    all_analyses.append(doc)
            except PyMongoError:
                pass

        # 2. In-Memory stores across all active services
        seen_ids = {a.get("analysisId") or a.get("id") for a in all_analyses}

        for rec in list(image_forensics_service._memory_analysis_records.values()):
            r_id = rec.get("analysisId") or rec.get("id")
            if r_id and r_id not in seen_ids:
                all_analyses.append(rec)
                seen_ids.add(r_id)

        for rec in list(object_detection_service._memory_analysis_records.values()):
            r_id = rec.get("analysisId") or rec.get("id")
            if r_id and r_id not in seen_ids:
                all_analyses.append(rec)
                seen_ids.add(r_id)

        for rec in list(fingerprint_service._memory_analysis_records.values()):
            r_id = rec.get("analysisId") or rec.get("id")
            if r_id and r_id not in seen_ids:
                all_analyses.append(rec)
                seen_ids.add(r_id)

        for rec in list(face_analysis_service._memory_analysis_records.values()):
            r_id = rec.get("analysisId") or rec.get("id")
            if r_id and r_id not in seen_ids:
                all_analyses.append(rec)
                seen_ids.add(r_id)

        for rec in list(sketch_service._memory_sessions.values()):
            r_id = rec.get("sessionId") or rec.get("id")
            if r_id and r_id not in seen_ids:
                all_analyses.append(rec)
                seen_ids.add(r_id)

        # Filter by authorized cases
        authorized_cases = case_service.list_authorized_cases(user)
        authorized_case_ids = {c["id"] for c in authorized_cases}
        authorized_case_numbers = {c.get("caseNumber") for c in authorized_cases}

        user_role = (user.get("role") or "").lower()
        filtered_analyses: List[Dict[str, Any]] = []

        for a in all_analyses:
            c_id = a.get("caseId")
            c_num = a.get("caseNumber")
            # Admins see all, others must have case clearance
            if user_role == "admin" or c_id in authorized_case_ids or c_num in authorized_case_numbers or not c_id:
                # Date filtering
                a_dt = parse_iso_datetime(a.get("timestamp") or a.get("createdAt"))
                if a_dt:
                    if start_dt and a_dt < start_dt:
                        continue
                    if end_dt and a_dt > end_dt:
                        continue
                    filtered_analyses.append(a)
                elif not start_dt:
                    filtered_analyses.append(a)

        # Status counts
        status_counts: Dict[str, int] = {}
        # Processing times
        times_by_module: Dict[str, List[float]] = {}
        all_times: List[float] = []

        for a in filtered_analyses:
            status = str(a.get("status", "completed")).lower()
            status_counts[status] = status_counts.get(status, 0) + 1

            # Processing time when recorded (check summary.inferenceLatencyMs for YOLO runs too)
            summary_obj = a.get("summary") if isinstance(a.get("summary"), dict) else {}
            ptime = (
                a.get("processingTimeMs")
                or a.get("executionTimeMs")
                or a.get("latencyMs")
                or a.get("durationMs")
                or summary_obj.get("inferenceLatencyMs")
            )
            if ptime is not None:
                try:
                    ptime_val = float(ptime)
                    if ptime_val >= 0:
                        all_times.append(ptime_val)
                        cat = str(a.get("category") or a.get("analysisType") or a.get("model") or "general_ai")
                        times_by_module.setdefault(cat, []).append(ptime_val)
                except (ValueError, TypeError):
                    pass

        jobs_by_status = [
            {"status": s, "count": cnt}
            for s, cnt in sorted(status_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        # Build processing times metrics
        processing_times_stats: Dict[str, Any] = {
            "available": len(all_times) > 0,
            "totalJobsMeasured": len(all_times),
            "overallAvgMs": round(sum(all_times) / len(all_times), 2) if all_times else 0.0,
            "overallMinMs": round(min(all_times), 2) if all_times else 0.0,
            "overallMaxMs": round(max(all_times), 2) if all_times else 0.0,
            "byModule": [],
        }

        MODULE_LABELS = {
            "image_forgery": "Image Forensics (ELA / Metadata)",
            "image_forensics": "Image Forensics (EXIF/ELA)",
            "ela_recompression": "Error Level Analysis (ELA)",
            "object_detection": "YOLO Scene Detection",
            "fingerprint_minutiae": "Fingerprint SIFT-RANSAC",
            "face_biometric_comparison": "Face Metric Verification",
            "sketch_comparison_session": "Witness Sketch Morphology",
            "sketch_experimental_probe": "CUHK Cross-Modality Sketch Probe",
            "general_ai": "Forensic Engine",
        }

        for cat, t_list in times_by_module.items():
            if t_list:
                processing_times_stats["byModule"].append({
                    "category": cat,
                    "label": MODULE_LABELS.get(cat, cat.replace("_", " ").title()),
                    "avgTimeMs": round(sum(t_list) / len(t_list), 2),
                    "minTimeMs": round(min(t_list), 2),
                    "maxTimeMs": round(max(t_list), 2),
                    "count": len(t_list),
                })

        return {
            "jobsByStatus": jobs_by_status,
            "processingTimes": processing_times_stats,
            "totalInRange": len(filtered_analyses),
            "filteredAnalyses": filtered_analyses,
        }

    def _aggregate_model_benchmarks_and_detections(
        self,
        filtered_analyses: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Return verified dataset evaluation benchmarks (zero dummy figures) alongside
        live database-backed detection confidence and correspondence statistics.
        """
        gun_meta = object_detection_service._load_gun_metadata() or {}
        sketch_meta = sketch_service._load_adapter_metadata() or {}

        det_runs: List[Dict[str, Any]] = []
        all_det_confs: List[float] = []
        gun_confs: List[float] = []
        total_det_boxes = 0
        total_gun_boxes = 0

        face_runs: List[Dict[str, Any]] = []
        face_cosines: List[float] = []
        face_det_confs: List[float] = []

        sketch_runs: List[Dict[str, Any]] = []
        sketch_aligned: List[float] = []
        sketch_baseline: List[float] = []

        fp_runs: List[Dict[str, Any]] = []
        fp_inliers: List[int] = []
        fp_ratios: List[float] = []

        for rec in filtered_analyses:
            cat = str(rec.get("category") or "").lower()
            ts = rec.get("timestamp") or rec.get("createdAt") or ""
            case_num = rec.get("caseNumber") or "N/A"

            if cat == "object_detection":
                objs = rec.get("detectedObjects") or []
                confs = [float(o["confidencePercent"]) for o in objs if o.get("confidencePercent") is not None]
                rec_gun_confs = [
                    float(o["confidencePercent"])
                    for o in objs
                    if str(o.get("className", "")).lower() == "gun" and o.get("confidencePercent") is not None
                ]
                all_det_confs.extend(confs)
                gun_confs.extend(rec_gun_confs)
                total_det_boxes += len(objs)
                total_gun_boxes += len(rec_gun_confs)
                summary = rec.get("summary") or {}
                det_runs.append({
                    "id": str(rec.get("analysisId") or rec.get("id") or ""),
                    "caseNumber": case_num,
                    "evidenceLabel": rec.get("evidenceFilename") or rec.get("evidenceNumber") or rec.get("evidenceId") or "Evidence",
                    "modelName": (rec.get("modelInfo") or {}).get("name") or rec.get("modelId") or "Detector",
                    "modelId": rec.get("modelId") or (rec.get("modelInfo") or {}).get("id") or "yolov4-tiny",
                    "totalObjects": len(objs),
                    "firearmDetections": len(rec_gun_confs),
                    "meanConfidencePercent": round(sum(confs) / len(confs), 1) if confs else None,
                    "maxConfidencePercent": round(max(confs), 1) if confs else None,
                    "minConfidencePercent": round(min(confs), 1) if confs else None,
                    "latencyMs": summary.get("inferenceLatencyMs") or rec.get("processingTimeMs"),
                    "timestamp": ts,
                })
            elif cat in {"face_biometric_comparison", "face_detection_quality"}:
                metrics = rec.get("metrics") or {}
                if cat == "face_biometric_comparison" and metrics.get("cosineSimilarity") is not None:
                    cos_val = float(metrics["cosineSimilarity"])
                    face_cosines.append(cos_val)
                    probe_conf = (rec.get("probeEvidence") or {}).get("faceConfidence")
                    if probe_conf is not None:
                        face_det_confs.append(float(probe_conf) * 100.0)
                    face_runs.append({
                        "id": str(rec.get("analysisId") or rec.get("id") or ""),
                        "caseNumber": case_num,
                        "mode": "1:1 Comparison",
                        "label": f"{(rec.get('probeEvidence') or {}).get('filename', 'Probe')} vs {(rec.get('referenceEvidence') or {}).get('filename', 'Ref')}",
                        "cosineSimilarity": round(cos_val, 4),
                        "detectorConfidencePercent": round(float(probe_conf) * 100.0, 1) if probe_conf is not None else None,
                        "correspondenceTier": metrics.get("correspondenceTier"),
                        "timestamp": ts,
                    })
                elif cat == "face_detection_quality":
                    faces = rec.get("faces") or []
                    confs = [float(f["confidence"]) * 100.0 for f in faces if f.get("confidence") is not None]
                    face_det_confs.extend(confs)
                    face_runs.append({
                        "id": str(rec.get("analysisId") or rec.get("id") or ""),
                        "caseNumber": case_num,
                        "mode": f"Face Detect ({len(faces)})",
                        "label": (rec.get("evidence") or {}).get("filename") or "Face Exhibit",
                        "cosineSimilarity": None,
                        "detectorConfidencePercent": round(sum(confs) / len(confs), 1) if confs else None,
                        "correspondenceTier": None,
                        "timestamp": ts,
                    })
            elif cat == "sketch_experimental_probe":
                metrics = rec.get("metrics") or {}
                if metrics.get("alignedCosineSimilarity") is not None:
                    al = float(metrics["alignedCosineSimilarity"])
                    bs = float(metrics.get("baselineRawSFaceSimilarity") or 0.0)
                    sketch_aligned.append(al)
                    sketch_baseline.append(bs)
                    sketch_runs.append({
                        "id": str(rec.get("analysisId") or rec.get("sessionId") or rec.get("id") or ""),
                        "caseNumber": case_num,
                        "label": f"{(rec.get('sketchEvidence') or {}).get('filename', 'Sketch')} vs {(rec.get('referenceEvidence') or {}).get('filename', 'Photo')}",
                        "alignedCosineSimilarity": round(al, 4),
                        "baselineCosineSimilarity": round(bs, 4),
                        "alignmentDelta": round(al - bs, 4),
                        "exploratoryBand": metrics.get("exploratoryBand"),
                        "timestamp": ts,
                    })
            elif cat == "fingerprint_minutiae":
                cm = rec.get("comparisonMetrics") or {}
                if cm.get("inlierCount") is not None:
                    inliers = int(cm["inlierCount"])
                    ratio = float(cm.get("inlierRatio") or 0.0)
                    fp_inliers.append(inliers)
                    fp_ratios.append(ratio * 100.0)
                    fp_runs.append({
                        "id": str(rec.get("analysisId") or rec.get("id") or ""),
                        "caseNumber": case_num,
                        "label": f"{(rec.get('probeEvidence') or {}).get('filename', 'Latent')} vs {(rec.get('referenceEvidence') or {}).get('filename', 'Tenprint')}",
                        "inlierCount": inliers,
                        "inlierRatioPercent": round(ratio * 100.0, 1),
                        "correspondenceTier": cm.get("correspondenceTier"),
                        "timestamp": ts,
                    })

        det_runs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        face_runs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        sketch_runs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        fp_runs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        return {
            "trainedBenchmarks": {
                "gunDetector": {
                    "available": bool(gun_meta),
                    "modelId": gun_meta.get("modelId", "forensic-gun-yolov8"),
                    "modelName": gun_meta.get("modelName", "ForenVision Gun & Person Detector (YOLOv8n)"),
                    "version": gun_meta.get("version"),
                    "modelSizeMB": gun_meta.get("modelSizeMB"),
                    "onnxSha256": gun_meta.get("onnxSha256"),
                    "trainingDataset": gun_meta.get("trainingDataset"),
                    "evaluationMetrics": gun_meta.get("evaluationMetrics"),
                    "trainedAt": gun_meta.get("trainedAt"),
                },
                "sketchAdapter": {
                    "available": bool(sketch_meta),
                    "modelId": sketch_meta.get("modelId", "cuhk-sketch-cross-modality-v1"),
                    "modelName": sketch_meta.get("modelName", "CUHK Cross-Modality Sketch-to-Photo Feature Adapter"),
                    "version": sketch_meta.get("version"),
                    "artifacts": sketch_meta.get("artifacts"),
                    "trainingDataset": sketch_meta.get("trainingDataset"),
                    "evaluationMetrics": sketch_meta.get("evaluationMetrics"),
                    "trainedAt": sketch_meta.get("trainedAt"),
                },
                "pretrainedEngines": [
                    {
                        "engineId": "yolov4-tiny",
                        "name": "YOLOv4-tiny (80-Class MS COCO)",
                        "status": "PRETRAINED_BASELINE",
                        "metricShown": "Per-box network confidence % (0-100%)",
                        "note": "Official Darknet COCO weights; no local ground-truth labeled accuracy split in workspace.",
                    },
                    {
                        "engineId": "yunet-sface",
                        "name": "YuNet + SFace (128-D Face Analysis)",
                        "status": "PRETRAINED_BIOMETRIC",
                        "metricShown": "YuNet detection confidence % + SFace Cosine Similarity & L2 distance",
                        "note": "OpenCV Zoo Apache-2.0 models; reports live geometric quality (IPD, sharpness) & similarity scores.",
                    },
                    {
                        "engineId": "sift-ransac",
                        "name": "Fingerprint AFIS (SIFT + RANSAC)",
                        "status": "CLASSICAL_GEOMETRIC",
                        "metricShown": "RANSAC inlier count & inlier ratio %",
                        "note": "Deterministic keypoint alignment & minutiae verification (requires human ACE-V review).",
                    },
                    {
                        "engineId": "pil-ela",
                        "name": "Image Forensics (ELA + EXIF)",
                        "status": "SIGNAL_PROCESSING",
                        "metricShown": "JPEG quantization delta (Mean / Peak / StdDev pixel error)",
                        "note": "Physical pixel residual diagnostic; intentionally does not fabricate fake tampering accuracy %.",
                    },
                ],
            },
            "liveDetectionStats": {
                "objectDetection": {
                    "runsCount": len(det_runs),
                    "totalDetections": total_det_boxes,
                    "firearmDetections": total_gun_boxes,
                    "meanConfidencePercent": round(sum(all_det_confs) / len(all_det_confs), 1) if all_det_confs else None,
                    "minConfidencePercent": round(min(all_det_confs), 1) if all_det_confs else None,
                    "maxConfidencePercent": round(max(all_det_confs), 1) if all_det_confs else None,
                    "meanGunConfidencePercent": round(sum(gun_confs) / len(gun_confs), 1) if gun_confs else None,
                    "recentRuns": det_runs[:10],
                },
                "faceAnalysis": {
                    "runsCount": len(face_runs),
                    "meanCosineSimilarity": round(sum(face_cosines) / len(face_cosines), 4) if face_cosines else None,
                    "maxCosineSimilarity": round(max(face_cosines), 4) if face_cosines else None,
                    "meanDetectorConfidencePercent": round(sum(face_det_confs) / len(face_det_confs), 1) if face_det_confs else None,
                    "recentRuns": face_runs[:10],
                },
                "sketchAnalysis": {
                    "runsCount": len(sketch_runs),
                    "meanAlignedCosine": round(sum(sketch_aligned) / len(sketch_aligned), 4) if sketch_aligned else None,
                    "meanBaselineCosine": round(sum(sketch_baseline) / len(sketch_baseline), 4) if sketch_baseline else None,
                    "meanAlignmentDelta": (
                        round((sum(sketch_aligned) - sum(sketch_baseline)) / len(sketch_aligned), 4)
                        if sketch_aligned else None
                    ),
                    "recentRuns": sketch_runs[:10],
                },
                "fingerprintAnalysis": {
                    "runsCount": len(fp_runs),
                    "meanInlierCount": round(sum(fp_inliers) / len(fp_inliers), 1) if fp_inliers else None,
                    "meanInlierRatioPercent": round(sum(fp_ratios) / len(fp_ratios), 1) if fp_ratios else None,
                    "recentRuns": fp_runs[:10],
                },
            },
        }

    def _aggregate_reports(
        self,
        user: Dict[str, Any],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> Dict[str, Any]:
        """Aggregate report generation counts, classifications, and trends."""
        user_reports = report_service.list_reports(user)

        in_range_reports: List[Dict[str, Any]] = []
        for r in user_reports:
            r_dt = parse_iso_datetime(r.get("createdAt"))
            if r_dt:
                if start_dt and r_dt < start_dt:
                    continue
                if end_dt and r_dt > end_dt:
                    continue
                in_range_reports.append(r)
            elif not start_dt:
                in_range_reports.append(r)

        class_counts: Dict[str, int] = {}
        date_counts: Dict[str, int] = {}

        for r in in_range_reports:
            classification = str(r.get("classification", "OFFICIAL COURT EXHIBIT")).upper()
            class_counts[classification] = class_counts.get(classification, 0) + 1

            r_dt = parse_iso_datetime(r.get("createdAt"))
            if r_dt:
                day_key = r_dt.strftime("%Y-%m-%d")
                date_counts[day_key] = date_counts.get(day_key, 0) + 1

        by_classification = [
            {"classification": c, "count": cnt}
            for c, cnt in sorted(class_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        over_time = [
            {"date": d, "count": cnt}
            for d, cnt in sorted(date_counts.items(), key=lambda x: x[0])
        ]

        return {
            "totalReports": len(in_range_reports),
            "byClassification": by_classification,
            "overTime": over_time,
        }

    def _aggregate_investigator_workload(
        self,
        user: Dict[str, Any],
        start_dt: Optional[datetime],
        end_dt: Optional[datetime],
    ) -> Dict[str, Any]:
        """
        Aggregate active vs. closed caseload per examiner.
        Enforces access restrictions:
        - Admin or supervisor: full anonymized breakdown across registered personnel.
        - Standard investigator: restricted to their personal workload (or team aggregate).
        - Avoids exposing confidential case details (only numeric totals and examiner badge).
        """
        user_role = (user.get("role") or "").lower()
        user_id = str(user.get("id") or user.get("user_id") or "")
        user_name = user.get("name") or "Authorized Examiner"
        user_badge = user.get("badge_number") or user.get("badge") or "N/A"

        # Check authorization to view all examiners' workload
        is_admin_or_supervisor = user_role in ("admin", "supervisor", "director")

        # Get all registered examiners
        all_examiners = user_service.list_users()

        # Get all authorized cases for the querying user
        authorized_cases = case_service.list_authorized_cases(user)

        # Date filter
        in_range_cases: List[Dict[str, Any]] = []
        for c in authorized_cases:
            c_dt = parse_iso_datetime(c.get("createdAt"))
            if c_dt:
                if start_dt and c_dt < start_dt:
                    continue
                if end_dt and c_dt > end_dt:
                    continue
                in_range_cases.append(c)
            elif not start_dt:
                in_range_cases.append(c)

        # Tally active vs closed cases per examiner
        # Key: examiner identifier or name
        workload_map: Dict[str, Dict[str, Any]] = {}

        # Initialize from registered examiners
        for u in all_examiners:
            u_id = str(u.get("id") or u.get("user_id") or "")
            workload_map[u_id] = {
                "investigatorId": u_id,
                "investigatorName": u.get("name", "Examiner"),
                "badge": u.get("badge_number") or u.get("badge", "N/A"),
                "role": u.get("role", "investigator"),
                "activeCases": 0,
                "closedCases": 0,
                "totalCases": 0,
            }

        ACTIVE_STATUSES = {"ACTIVE", "OPEN", "IN_PROGRESS", "UNDER_REVIEW"}

        for c in in_range_cases:
            is_active = str(c.get("status", "ACTIVE")).upper() in ACTIVE_STATUSES
            assigned_list = [str(a) for a in c.get("assignedExaminers") or []]
            lead = str(c.get("leadInvestigator") or "")

            # Combine lead and assigned
            examiners_for_case = set(assigned_list)
            if lead:
                examiners_for_case.add(lead)

            for ex_ref in examiners_for_case:
                # Find matching user key
                matched_key = None
                for u_id, info in workload_map.items():
                    if u_id == ex_ref or info["investigatorName"].lower() in ex_ref.lower() or info["badge"].lower() in ex_ref.lower():
                        matched_key = u_id
                        break

                if not matched_key:
                    # Dynamically add unlisted examiner reference
                    matched_key = f"ext_{ex_ref}"
                    workload_map[matched_key] = {
                        "investigatorId": matched_key,
                        "investigatorName": ex_ref,
                        "badge": "ASSIGNED",
                        "role": "investigator",
                        "activeCases": 0,
                        "closedCases": 0,
                        "totalCases": 0,
                    }

                if is_active:
                    workload_map[matched_key]["activeCases"] += 1
                else:
                    workload_map[matched_key]["closedCases"] += 1
                workload_map[matched_key]["totalCases"] += 1

        all_workload_list = [
            item for item in workload_map.values()
            if item["totalCases"] > 0 or item["activeCases"] > 0 or is_admin_or_supervisor
        ]
        all_workload_list.sort(key=lambda x: x["activeCases"], reverse=True)

        if is_admin_or_supervisor:
            return {
                "isAuthorized": True,
                "scope": "ALL_PERSONNEL",
                "notice": "Administrative access: viewing agency-wide investigator workload distribution.",
                "workload": all_workload_list,
            }
        else:
            # For standard investigator/analyst: return ONLY their personal record
            personal_workload = [
                item for item in all_workload_list
                if item["investigatorId"] == user_id or user_name.lower() in item["investigatorName"].lower()
            ]
            if not personal_workload:
                # User has 0 active cases
                personal_workload = [{
                    "investigatorId": user_id,
                    "investigatorName": user_name,
                    "badge": user_badge,
                    "role": user_role,
                    "activeCases": 0,
                    "closedCases": 0,
                    "totalCases": 0,
                }]

            return {
                "isAuthorized": False,
                "scope": "PERSONAL_ONLY",
                "notice": (
                    "Notice: Agency-wide peer personnel workload metrics are restricted to administrative clearance. "
                    "Displaying authorized individual caseload metrics only."
                ),
                "workload": personal_workload,
            }


analytics_service = AnalyticsService()
