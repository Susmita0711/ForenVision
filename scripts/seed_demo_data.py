#!/usr/bin/env python3
"""
Idempotent Demo Bootstrap Script for ForenVision AI.
Seeds baseline clearance users, two sample forensic investigation dockets,
and verified evidentiary artifacts from the repository's datasets & fixtures
so examiners can immediately inspect all platform workflows end-to-end.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app import create_app
from services.db import db_service
from services.user_service import user_service
from services.case_service import case_service
from services.evidence_service import evidence_service
from services.custody_service import custody_service
from services.image_forensics_service import image_forensics_service
from services.object_detection_service import object_detection_service
from services.face_analysis_service import face_analysis_service
from services.fingerprint_service import fingerprint_service
from services.sketch_service import sketch_service
from services.report_service import report_service


def _ensure_case_with_evidence(
    db,
    *,
    title: str,
    incident_type: str,
    priority: str,
    description: str,
    tags: list[str],
    user: dict,
    assigned_examiners: list[str],
    exhibits: list[tuple[Path, str, str, str, list[str]]],
) -> tuple[str, str, dict[str, str], bool]:
    """Idempotently ensure a case and its physical exhibits exist in MongoDB."""
    existing = db["cases"].find_one({"title": title})
    created_new = False
    if existing:
        case_id = str(existing.get("id") or existing.get("_id"))
        case_number = existing.get("caseNumber", case_id)
    else:
        case_doc = case_service.create_case(
            title=title,
            incident_type=incident_type,
            priority=priority,
            description=description,
            user=user,
            tags=tags,
            assigned_examiners=assigned_examiners,
        )
        case_id = str(case_doc["id"])
        case_number = case_doc["caseNumber"]
        created_new = True
        print(f"[Seed] Created case {case_number}: {title}")

    existing_docs = list(db["evidence"].find({"caseId": case_id}, {"id": 1, "_id": 1, "originalFileName": 1}))
    ev_map: dict[str, str] = {
        doc["originalFileName"]: str(doc.get("id") or doc.get("_id"))
        for doc in existing_docs
        if doc.get("originalFileName")
    }

    added = 0
    for path, fname, etype, notes, item_tags in exhibits:
        if fname not in ev_map and path.is_file():
            stored = evidence_service.store_evidence(
                file_bytes=path.read_bytes(),
                original_filename=fname,
                case_id_or_number=case_id,
                user=user,
                evidence_type=etype,
                notes=notes,
                tags=item_tags,
            )
            ev_map[fname] = str(stored["id"])
            added += 1
    if not created_new and added:
        print(f"[Seed] Attached {added} missing evidence item(s) to {case_number}")
    return case_id, case_number, ev_map, created_new


def _ensure_custody_events(db, evidence_id: str, user: dict, events: list[dict[str, str]]) -> int:
    """Append custody transition blocks only if identical eventType+reason is absent."""
    ev_doc = db["evidence"].find_one({"id": evidence_id}, {"_id": 1, "id": 1, "evidenceNumber": 1})
    candidate_ids = [evidence_id]
    query: dict = {"evidenceId": {"$in": candidate_ids}}
    if ev_doc:
        if ev_doc.get("_id"):
            candidate_ids.append(str(ev_doc["_id"]))
        if ev_doc.get("id"):
            candidate_ids.append(str(ev_doc["id"]))
        if ev_doc.get("evidenceNumber"):
            query = {"$or": [{"evidenceId": {"$in": candidate_ids}}, {"evidenceNumber": ev_doc["evidenceNumber"]}]}

    existing_keys = {
        (doc.get("eventType"), doc.get("reason"))
        for doc in db["chain_of_custody"].find(query, {"eventType": 1, "reason": 1})
    }
    created = 0
    for ev_payload in events:
        key = (ev_payload.get("eventType"), ev_payload.get("reason"))
        if key not in existing_keys:
            custody_service.record_custody_event(evidence_id, ev_payload, user)
            existing_keys.add(key)
            created += 1
    return created


def _ensure_case_report(
    db,
    *,
    case_id: str,
    case_number: str,
    user: dict,
    title: str,
    investigator_notes: str,
) -> None:
    """Compile one real ReportLab PDF dossier if none is stored yet for this case."""
    if db["forensic_reports"].count_documents({"caseId": case_id}) > 0:
        return
    report = report_service.generate_case_report(
        case_id,
        user,
        title=title,
        classification="OFFICIAL COURT EXHIBIT",
        investigator_notes=investigator_notes,
    )
    print(f"[Seed] Compiled court report {report.get('reportNumber')} for {case_number}")


def seed_platform() -> None:
    app = create_app("development")
    with app.app_context():
        user_service.ensure_default_users_seeded()
        db = db_service.get_db()
        if db is None:
            print("[Seed] MongoDB not connected; skipping persistent DB seed.")
            return

        admin = user_service.find_by_email("admin@forenvision.internal")
        investigator = user_service.find_by_email("e.reed@forenvision.internal")
        analyst = user_service.find_by_email("s.vance@forenvision.internal")

        if not admin or not investigator:
            print("[Seed] Baseline users missing; aborting.")
            return

        # Case 1: Armed Scene & Firearm Detection Showcase
        case1_title = "Armed Scene Weapon Localization & Scene Forensics"
        existing_c1 = db["cases"].find_one({"title": case1_title})
        if existing_c1:
            print(f"[Seed] Case 1 already exists ({existing_c1.get('caseNumber')}); skipping.")
        else:
            examiners = [f"{investigator['name']} ({investigator.get('badge_number', 'N/A')})"]
            if analyst:
                examiners.append(f"{analyst['name']} ({analyst.get('badge_number', 'N/A')})")
            case1 = case_service.create_case(
                title=case1_title,
                incident_type="Homicide / Scene",
                priority="high",
                description=(
                    "Investigative docket containing surveillance scene imagery for YOLOv8n "
                    "firearm/person localization, YOLOv4-tiny scene inventory, and ELA verification."
                ),
                user=investigator,
                tags=["Firearm Detection", "Scene Photography", "ELA"],
                assigned_examiners=examiners,
            )

            scene_files = [
                (
                    BASE_DIR / "datasets" / "prepared" / "gun_detection" / "images" / "test" / "009_9.jpeg",
                    "surveillance_scene_009.jpeg",
                    "image",
                    "Held-out surveillance test image from People with Guns dataset.",
                    ["Firearm Scene", "Test Split"],
                ),
                (
                    BASE_DIR / "datasets" / "prepared" / "gun_detection" / "images" / "val" / "000_0.jpg",
                    "scene_exhibit_000.jpg",
                    "image",
                    "Validation scene exhibit for firearm and person localization.",
                    ["Firearm Scene", "Validation Split"],
                ),
                (
                    BACKEND_DIR / "tests" / "fixtures" / "sample_detection.jpg",
                    "street_scene_reference.jpg",
                    "image",
                    "Standard MS COCO reference scene for YOLOv4-tiny baseline verification.",
                    ["COCO Reference"],
                ),
            ]

            for path, fname, etype, notes, tags in scene_files:
                if path.is_file():
                    evidence_service.store_evidence(
                        file_bytes=path.read_bytes(),
                        original_filename=fname,
                        case_id_or_number=case1["id"],
                        user=investigator,
                        evidence_type=etype,
                        notes=notes,
                        tags=tags,
                    )
            print(f"[Seed] Created showcase case {case1['caseNumber']}")

        # Case 2: Witness Composite Sketch & Biometric Comparison Showcase
        case2_title = "Witness Composite Sketch & Latent Biometric Inquiry"
        existing_c2 = db["cases"].find_one({"title": case2_title})
        biometric_files = [
            (
                BASE_DIR / "datasets" / "raw" / "cuhk_face_sketch" / "sketches" / "F2-005-01-sz1.jpg",
                "witness_sketch_f005.jpg",
                "sketch",
                "CUHK witness composite sketch exemplar (Subject F-005).",
                ["Witness Composite", "CUHK"],
            ),
            (
                BASE_DIR / "datasets" / "raw" / "cuhk_face_sketch" / "photos" / "f-005-01.jpg",
                "reference_photo_f005.jpg",
                "face",
                "Paired reference photograph (Subject F-005) for morphological & cross-modality review.",
                ["Reference Exemplar", "CUHK"],
            ),
            (
                BACKEND_DIR / "tests" / "fixtures" / "sample_face_scene_1.jpg",
                "facial_probe_scene.jpg",
                "face",
                "Scene facial capture probe for 1:1 YuNet + SFace verification.",
                ["Facial Biometrics", "Probe"],
            ),
            (
                BACKEND_DIR / "tests" / "fixtures" / "sample_face_scene_mate.jpg",
                "facial_reference_mate.jpg",
                "face",
                "Known facial reference mate photograph for 1:1 comparison.",
                ["Facial Biometrics", "Reference"],
            ),
            (
                BACKEND_DIR / "tests" / "fixtures" / "sample_print_1.jpg",
                "latent_print_probe.jpg",
                "fingerprint",
                "Latent fingerprint impression lifted from entry door handle.",
                ["Latent Print", "Probe"],
            ),
            (
                BACKEND_DIR / "tests" / "fixtures" / "sample_print_1_mate.jpg",
                "tenprint_reference_card.jpg",
                "fingerprint",
                "Known tenprint reference card exemplar.",
                ["Reference Print", "Exemplar"],
            ),
        ]

        if existing_c2:
            case2_id = str(existing_c2.get("_id") or existing_c2.get("id"))
            existing_names = {
                doc.get("originalFileName")
                for doc in db["evidence"].find({"caseId": case2_id}, {"originalFileName": 1})
            }
            added = 0
            for path, fname, etype, notes, tags in biometric_files:
                if fname not in existing_names and path.is_file():
                    evidence_service.store_evidence(
                        file_bytes=path.read_bytes(),
                        original_filename=fname,
                        case_id_or_number=case2_id,
                        user=investigator,
                        evidence_type=etype,
                        notes=notes,
                        tags=tags,
                    )
                    added += 1
            print(f"[Seed] Case 2 exists ({existing_c2.get('caseNumber')}); synced {added} missing exhibits.")
        else:
            examiners2 = [f"{investigator['name']} ({investigator.get('badge_number', 'N/A')})"]
            if analyst:
                examiners2.append(f"{analyst['name']} ({analyst.get('badge_number', 'N/A')})")
            case2 = case_service.create_case(
                title=case2_title,
                incident_type="Biometric Match",
                priority="critical",
                description=(
                    "Controlled morphological sketch review (CUHK Face Sketch pair), 1:1 facial "
                    "comparison, and latent fingerprint SIFT-RANSAC alignment docket."
                ),
                user=investigator,
                tags=["Witness Sketch", "Face Analysis", "Fingerprint AFIS"],
                assigned_examiners=examiners2,
            )

            for path, fname, etype, notes, tags in biometric_files:
                if path.is_file():
                    evidence_service.store_evidence(
                        file_bytes=path.read_bytes(),
                        original_filename=fname,
                        case_id_or_number=case2["id"],
                        user=investigator,
                        evidence_type=etype,
                        notes=notes,
                        tags=tags,
                    )
            print(f"[Seed] Created showcase case {case2['caseNumber']}")

        examiners_all = [f"{investigator['name']} ({investigator.get('badge_number', 'N/A')})"]
        if analyst:
            examiners_all.append(f"{analyst['name']} ({analyst.get('badge_number', 'N/A')})")
        archive_guns = BASE_DIR / "datasets" / "archive (1)" / "images"
        archive_cuhk = BASE_DIR / "datasets" / "archive"
        fixtures_dir = BACKEND_DIR / "tests" / "fixtures"

        # Case 3: Highway Perimeter Armed Surveillance & Threat Assessment (archive (1) exhibits)
        c3_id, c3_num, c3_ev, _ = _ensure_case_with_evidence(
            db,
            title="Highway Perimeter Armed Surveillance & Threat Assessment",
            incident_type="Firearms Recovery",
            priority="critical",
            description=(
                "Multi-camera perimeter surveillance review from archive (1) firearm frames; "
                "includes YOLOv8n firearm detection, combined dual-detector sweeps, EXIF audit, "
                "and Error Level Analysis tamper inspection."
            ),
            tags=["Firearm Scene", "YOLOv8n", "ELA", "Perimeter CCTV"],
            user=investigator,
            assigned_examiners=examiners_all,
            exhibits=[
                (
                    archive_guns / "1.jpg",
                    "perimeter_cam_001.jpg",
                    "image",
                    "Validation split armed perimeter capture from datasets/archive (1).",
                    ["Firearm Scene", "Validation"],
                ),
                (
                    archive_guns / "7.jpg",
                    "checkpoint_cam_007.jpg",
                    "image",
                    "Gate approach frame containing subject and firearm annotation ground truth.",
                    ["Firearm Scene", "Checkpoint"],
                ),
                (
                    archive_guns / "9.jpeg",
                    "exit_corridor_009.jpeg",
                    "image",
                    "Held-out surveillance test image from datasets/archive (1).",
                    ["Firearm Scene", "Test Split"],
                ),
                (
                    archive_guns / "5.jpg",
                    "warehouse_bay_005.jpg",
                    "image",
                    "Interior loading bay camera frame with potential concealed weapon.",
                    ["Firearm Scene", "Interior"],
                ),
            ],
        )
        for fname in ("perimeter_cam_001.jpg", "exit_corridor_009.jpeg"):
            if fname in c3_ev:
                _ensure_custody_events(
                    db,
                    c3_ev[fname],
                    investigator,
                    [
                        {
                            "eventType": "sealed",
                            "location": "Digital Vault Locker B-12",
                            "reason": "Cryptographic SHA-256 baseline sealed prior to AI inference.",
                        },
                        {
                            "eventType": "analysed",
                            "location": "Ballistics & Vision Lab",
                            "reason": "Executed YOLOv8n firearm scan and ELA compression inspection.",
                        },
                    ],
                )
        if db["analysis_results"].count_documents({"caseId": c3_id}) == 0:
            for fname in ("perimeter_cam_001.jpg", "checkpoint_cam_007.jpg", "exit_corridor_009.jpeg", "warehouse_bay_005.jpg"):
                if fname in c3_ev:
                    object_detection_service.run_detection(c3_ev[fname], investigator, model_id="forensic-gun-yolov8")
                    image_forensics_service.extract_image_metadata(c3_ev[fname], investigator)
            if "exit_corridor_009.jpeg" in c3_ev:
                object_detection_service.run_detection(c3_ev["exit_corridor_009.jpeg"], investigator, model_id="combined")
                image_forensics_service.perform_error_level_analysis(c3_ev["exit_corridor_009.jpeg"], investigator)
            print(f"[Seed] Executed real analyses for {c3_num}")
        _ensure_case_report(
            db,
            case_id=c3_id,
            case_number=c3_num,
            user=investigator,
            title="Perimeter Surveillance Firearm Detection & ELA Dossier",
            investigator_notes=(
                "Executed fine-tuned YOLOv8n (archive (1)) and combined dual-detector scans across four "
                "perimeter frames with ELA compression and EXIF provenance checks."
            ),
        )

        # Case 4: Commercial Corridor Witness Composite & Identity Match (archive CUHK subjects)
        c4_id, c4_num, c4_ev, _ = _ensure_case_with_evidence(
            db,
            title="Commercial Corridor Witness Composite & Identity Match",
            incident_type="Witness Composite Review",
            priority="high",
            description=(
                "Cross-modality witness composite review pairing real CUHK sketches and photographs "
                "from datasets/archive, including mated pair verification and non-mate negative control."
            ),
            tags=["Witness Sketch", "CUHK Matcher", "Face Analysis"],
            user=investigator,
            assigned_examiners=examiners_all,
            exhibits=[
                (
                    archive_cuhk / "sketches" / "M2-008-01-sz1.jpg",
                    "corridor_sketch_m008.jpg",
                    "sketch",
                    "CUHK witness composite sketch exemplar (Subject M-008).",
                    ["Witness Composite", "CUHK"],
                ),
                (
                    archive_cuhk / "photos" / "m-008-01.jpg",
                    "reference_photo_m008.jpg",
                    "face",
                    "Mated CUHK reference portrait for Subject M-008.",
                    ["Reference Photo", "CUHK"],
                ),
                (
                    archive_cuhk / "sketches" / "m1-041-01-sz1.jpg",
                    "exit_sketch_m1_041.jpg",
                    "sketch",
                    "CUHK witness composite sketch exemplar (Subject M1-041).",
                    ["Witness Composite", "CUHK"],
                ),
                (
                    archive_cuhk / "photos" / "m1-041-01.jpg",
                    "reference_photo_m1_041.jpg",
                    "face",
                    "Mated CUHK reference portrait for Subject M1-041.",
                    ["Reference Photo", "CUHK"],
                ),
                (
                    archive_cuhk / "photos" / "f-010-01.jpg",
                    "control_nonmate_f010.jpg",
                    "face",
                    "Negative control non-mate CUHK reference photograph (Subject F-010).",
                    ["Negative Control", "CUHK"],
                ),
            ],
        )
        if "corridor_sketch_m008.jpg" in c4_ev:
            _ensure_custody_events(
                db,
                c4_ev["corridor_sketch_m008.jpg"],
                investigator,
                [
                    {
                        "eventType": "received",
                        "location": "Sketch & Biometrics Intake Desk",
                        "reason": "Received composite artist rendering and sealed digital scan.",
                    },
                    {
                        "eventType": "analysed",
                        "location": "Cross-Modality Lab",
                        "reason": "Evaluated with CUHK Residual Adapter and SFace embedding projection.",
                    },
                ],
            )
        if db["analysis_results"].count_documents(
            {"$or": [{"caseId": c4_id}, {"probeEvidence.caseId": c4_id}, {"evidence.caseId": c4_id}]}
        ) < 4:
            if "corridor_sketch_m008.jpg" in c4_ev and "reference_photo_m008.jpg" in c4_ev:
                sketch_service.compare_sketch_experimental(
                    c4_ev["corridor_sketch_m008.jpg"], c4_ev["reference_photo_m008.jpg"], investigator
                )
            if db["analysis_results"].count_documents({"caseId": c4_id}) < 2 and "exit_sketch_m1_041.jpg" in c4_ev and "reference_photo_m1_041.jpg" in c4_ev:
                sketch_service.compare_sketch_experimental(
                    c4_ev["exit_sketch_m1_041.jpg"], c4_ev["reference_photo_m1_041.jpg"], investigator
                )
            if "corridor_sketch_m008.jpg" in c4_ev and "control_nonmate_f010.jpg" in c4_ev:
                sketch_service.compare_sketch_experimental(
                    c4_ev["corridor_sketch_m008.jpg"], c4_ev["control_nonmate_f010.jpg"], investigator
                )
            if "reference_photo_m008.jpg" in c4_ev and "control_nonmate_f010.jpg" in c4_ev:
                face_analysis_service.analyze_single_face(c4_ev["reference_photo_m008.jpg"], investigator)
                face_analysis_service.compare_faces(
                    c4_ev["reference_photo_m008.jpg"], c4_ev["control_nonmate_f010.jpg"], investigator
                )
            print(f"[Seed] Executed real analyses for {c4_num}")
        _ensure_case_report(
            db,
            case_id=c4_id,
            case_number=c4_num,
            user=investigator,
            title="Witness Composite Cross-Modality & Control Dossier",
            investigator_notes=(
                "Evaluated two CUHK mated composite pairs (M-008 and M1-041) alongside a negative control "
                "(F-010) using the re-trained CUHK sketch matcher and YuNet+SFace face diagnostics."
            ),
        )

        # Case 5: Vault Intrusion Latent Ridge & Dual-Print Comparison
        c5_id, c5_num, c5_ev, _ = _ensure_case_with_evidence(
            db,
            title="Vault Intrusion Latent Ridge & Dual-Print Comparison",
            incident_type="Burglary & Latent Print",
            priority="high",
            description=(
                "Latent ridge impression recovered from display glass compared against candidate tenprint "
                "exemplar and non-mate negative control print using SIFT-RANSAC geometric verification."
            ),
            tags=["Latent Print", "SIFT-RANSAC", "ELA"],
            user=investigator,
            assigned_examiners=examiners_all,
            exhibits=[
                (
                    fixtures_dir / "sample_print_1.jpg",
                    "glass_case_latent_01.jpg",
                    "fingerprint",
                    "Primary latent print lifted from tempered vault glass panel.",
                    ["Latent Print", "Probe"],
                ),
                (
                    fixtures_dir / "sample_print_1_mate.jpg",
                    "suspect_tenprint_exemplar_a.jpg",
                    "fingerprint",
                    "Candidate tenprint rolled exemplar matching source morphology.",
                    ["Reference Print", "Mate"],
                ),
                (
                    fixtures_dir / "sample_print_2.jpg",
                    "non_mate_control_print_b.jpg",
                    "fingerprint",
                    "Elimination control tenprint exemplar from authorized staff.",
                    ["Reference Print", "Negative Control"],
                ),
            ],
        )
        if "glass_case_latent_01.jpg" in c5_ev:
            _ensure_custody_events(
                db,
                c5_ev["glass_case_latent_01.jpg"],
                investigator,
                [
                    {
                        "eventType": "checked_out",
                        "location": "AFIS Ridge Workstation #3",
                        "reason": "Checked out for SIFT-RANSAC geometric minutiae correlation.",
                    },
                    {
                        "eventType": "returned",
                        "location": "Vault Storage Drawer F-04",
                        "reason": "Returned intact following non-destructive digital comparison.",
                    },
                ],
            )
        if db["analysis_results"].count_documents({"caseId": c5_id}) == 0:
            probe_fp = c5_ev.get("glass_case_latent_01.jpg")
            mate_fp = c5_ev.get("suspect_tenprint_exemplar_a.jpg")
            nonmate_fp = c5_ev.get("non_mate_control_print_b.jpg")
            if probe_fp and mate_fp:
                fingerprint_service.compare_fingerprints(probe_fp, mate_fp, investigator)
            if probe_fp and nonmate_fp:
                fingerprint_service.compare_fingerprints(probe_fp, nonmate_fp, investigator)
            if probe_fp:
                image_forensics_service.perform_error_level_analysis(probe_fp, investigator)
                image_forensics_service.extract_image_metadata(probe_fp, investigator)
            print(f"[Seed] Executed real analyses for {c5_num}")
        _ensure_case_report(
            db,
            case_id=c5_id,
            case_number=c5_num,
            user=investigator,
            title="Vault Intrusion Latent Ridge SIFT-RANSAC Dossier",
            investigator_notes=(
                "Executed bidirectional SIFT-RANSAC geometric alignment against candidate exemplar and "
                "negative elimination print, supported by ELA integrity verification."
            ),
        )

        # Case 6: Urban Plaza CCTV Facial Verification & Multi-Model Audit
        c6_id, c6_num, c6_ev, _ = _ensure_case_with_evidence(
            db,
            title="Urban Plaza CCTV Facial Verification & Multi-Model Audit",
            incident_type="CCTV Person Verification",
            priority="medium",
            description=(
                "Multi-module CCTV docket combining 1:1 YuNet+SFace facial verification, YOLOv4-tiny "
                "public-scene person/object baseline, and YOLOv8n armed alley check."
            ),
            tags=["Face Verification", "YOLOv4-tiny", "YOLOv8n", "CCTV"],
            user=investigator,
            assigned_examiners=examiners_all,
            exhibits=[
                (
                    fixtures_dir / "sample_face_scene_1.jpg",
                    "plaza_cam_crop_01.jpg",
                    "face",
                    "CCTV facial capture probe extracted at plaza north entrance.",
                    ["Facial Probe", "CCTV"],
                ),
                (
                    fixtures_dir / "sample_face_scene_mate.jpg",
                    "booking_reference_01.jpg",
                    "face",
                    "Controlled reference portrait for 1:1 YuNet+SFace verification.",
                    ["Facial Reference"],
                ),
                (
                    fixtures_dir / "sample_detection.jpg",
                    "plaza_overview_cam_02.jpg",
                    "image",
                    "Wide-angle plaza frame analyzed with MS COCO YOLOv4-tiny baseline.",
                    ["Wide Scene", "COCO"],
                ),
                (
                    archive_guns / "3.jpg",
                    "alley_cam_003.jpg",
                    "image",
                    "Adjacent service alley surveillance frame checked for firearm presence.",
                    ["Firearm Check", "Archive (1)"],
                ),
            ],
        )
        if "plaza_cam_crop_01.jpg" in c6_ev:
            _ensure_custody_events(
                db,
                c6_ev["plaza_cam_crop_01.jpg"],
                investigator,
                [
                    {
                        "eventType": "transferred",
                        "location": "Biometric Review Unit",
                        "reason": "Transferred for 1:1 YuNet+SFace cosine similarity verification.",
                    },
                    {
                        "eventType": "sealed",
                        "location": "Digital Vault Locker A-09",
                        "reason": "Re-sealed following automated diagnostics completion.",
                    },
                ],
            )
        if db["analysis_results"].count_documents({"caseId": c6_id}) == 0:
            if "plaza_cam_crop_01.jpg" in c6_ev and "booking_reference_01.jpg" in c6_ev:
                face_analysis_service.analyze_single_face(c6_ev["plaza_cam_crop_01.jpg"], investigator)
                face_analysis_service.compare_faces(
                    c6_ev["plaza_cam_crop_01.jpg"], c6_ev["booking_reference_01.jpg"], investigator
                )
            if "plaza_overview_cam_02.jpg" in c6_ev:
                object_detection_service.run_detection(
                    c6_ev["plaza_overview_cam_02.jpg"], investigator, model_id="yolov4-tiny"
                )
                image_forensics_service.extract_image_metadata(c6_ev["plaza_overview_cam_02.jpg"], investigator)
            if "alley_cam_003.jpg" in c6_ev:
                object_detection_service.run_detection(
                    c6_ev["alley_cam_003.jpg"], investigator, model_id="forensic-gun-yolov8"
                )
                image_forensics_service.perform_error_level_analysis(c6_ev["alley_cam_003.jpg"], investigator)
            print(f"[Seed] Executed real analyses for {c6_num}")
        _ensure_case_report(
            db,
            case_id=c6_id,
            case_number=c6_num,
            user=investigator,
            title="Urban Plaza Multi-Model Facial & Object Audit Dossier",
            investigator_notes=(
                "Combined 1:1 YuNet+SFace facial verification on plaza captures with YOLOv4-tiny overview "
                "baseline and YOLOv8n firearm screening on adjacent alley footage."
            ),
        )

        # Case 7: Cross-Border Contraband Armory Inspection Docket (remaining archive (1) exhibits)
        c7_id, c7_num, c7_ev, _ = _ensure_case_with_evidence(
            db,
            title="Cross-Border Contraband Armory Inspection Docket",
            incident_type="Contraband Interdiction",
            priority="critical",
            description=(
                "Full evidentiary sweep of cargo port and stairwell CCTV stills from datasets/archive (1) "
                "using re-trained YOLOv8n weights, combined detection, ELA, and EXIF inspection."
            ),
            tags=["Contraband", "Firearms", "YOLOv8n", "Court Exhibit"],
            user=investigator,
            assigned_examiners=examiners_all,
            exhibits=[
                (
                    archive_guns / "2.jpg",
                    "dock_cam_002.jpg",
                    "image",
                    "Loading dock camera frame from datasets/archive (1).",
                    ["Firearm Scene", "Dock"],
                ),
                (
                    archive_guns / "4.jpg",
                    "cargo_bay_004.jpg",
                    "image",
                    "Cargo bay interior frame from datasets/archive (1).",
                    ["Firearm Scene", "Cargo"],
                ),
                (
                    archive_guns / "6.jpg",
                    "perimeter_gate_006.jpg",
                    "image",
                    "Outer gate frame from datasets/archive (1).",
                    ["Firearm Scene", "Gate"],
                ),
                (
                    archive_guns / "8.jpg",
                    "storage_unit_008.jpg",
                    "image",
                    "Storage unit approach capture from datasets/archive (1).",
                    ["Firearm Scene", "Storage"],
                ),
                (
                    archive_guns / "10.jpeg",
                    "stairwell_010.jpeg",
                    "image",
                    "Stairwell camera capture from datasets/archive (1).",
                    ["Firearm Scene", "Stairwell"],
                ),
            ],
        )
        if "storage_unit_008.jpg" in c7_ev:
            _ensure_custody_events(
                db,
                c7_ev["storage_unit_008.jpg"],
                investigator,
                [
                    {
                        "eventType": "assigned",
                        "location": "Field Evidence Intake",
                        "reason": "Assigned to Lead Investigator Reed for contraband exhibit validation.",
                    },
                    {
                        "eventType": "analysed",
                        "location": "Automated Vision Unit",
                        "reason": "Processed across YOLOv8n and Combined detection pipelines.",
                    },
                ],
            )
        if db["analysis_results"].count_documents({"caseId": c7_id}) == 0:
            for fname in ("dock_cam_002.jpg", "cargo_bay_004.jpg", "perimeter_gate_006.jpg", "storage_unit_008.jpg", "stairwell_010.jpeg"):
                if fname in c7_ev:
                    object_detection_service.run_detection(c7_ev[fname], investigator, model_id="forensic-gun-yolov8")
            if "storage_unit_008.jpg" in c7_ev:
                object_detection_service.run_detection(c7_ev["storage_unit_008.jpg"], investigator, model_id="combined")
                image_forensics_service.perform_error_level_analysis(c7_ev["storage_unit_008.jpg"], investigator)
                image_forensics_service.extract_image_metadata(c7_ev["storage_unit_008.jpg"], investigator)
            print(f"[Seed] Executed real analyses for {c7_num}")
        _ensure_case_report(
            db,
            case_id=c7_id,
            case_number=c7_num,
            user=investigator,
            title="Contraband Armory Multi-Camera YOLOv8n Examination Report",
            investigator_notes=(
                "Executed firearm and subject localization across five port/corridor exhibits using "
                "the archive (1) trained YOLOv8n model, combined dual-detector cross-check, and ELA verification."
            ),
        )


if __name__ == "__main__":
    seed_platform()

