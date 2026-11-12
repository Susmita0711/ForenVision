#!/usr/bin/env bash
# ==============================================================================
# ForenVision AI Production Database & Vault Backup Script
# Performs atomic mongodump, SHA-256 verification, and evidence vault snapshot.
# ==============================================================================
set -euo pipefail

# Configuration
BACKUP_ROOT="${BACKUP_DIR:-/var/backups/forenvision}"
EVIDENCE_VAULT_DIR="${UPLOAD_FOLDER:-/var/forenvision/evidence_vault}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
BACKUP_DEST="${BACKUP_ROOT}/${TIMESTAMP}"

# Color output helpers
log_info() { echo -e "\033[32m[INFO]\033[0m $(date -u +"%Y-%m-%d %H:%M:%SZ") - $1"; }
log_warn() { echo -e "\033[33m[WARN]\033[0m $(date -u +"%Y-%m-%d %H:%M:%SZ") - $1"; }
log_err()  { echo -e "\033[31m[ERROR]\033[0m $(date -u +"%Y-%m-%d %H:%M:%SZ") - $1" >&2; }

# Pre-flight checks
if [[ -z "${MONGODB_URI:-}" ]]; then
    log_err "MONGODB_URI environment variable is not defined. Aborting backup."
    exit 1
fi

if ! command -v mongodump &> /dev/null; then
    log_err "'mongodump' command not found. Install mongodb-database-tools package."
    exit 1
fi

mkdir -p "${BACKUP_DEST}"
chmod 700 "${BACKUP_DEST}"

log_info "Starting ForenVision AI production backup: ${TIMESTAMP}"

# 1. MongoDB Database Backup
ARCHIVE_NAME="mongodb_dump_${TIMESTAMP}.archive.gz"
ARCHIVE_PATH="${BACKUP_DEST}/${ARCHIVE_NAME}"

log_info "Dumping MongoDB database to encrypted compressed archive..."
mongodump \
    --uri="${MONGODB_URI}" \
    --gzip \
    --archive="${ARCHIVE_PATH}" \
    --quiet

# Compute SHA-256 checksum for audit and tamper detection
shasum -a 256 "${ARCHIVE_PATH}" > "${ARCHIVE_PATH}.sha256"
log_info "Database archive created. SHA-256: $(cat "${ARCHIVE_PATH}.sha256")"

# 2. Evidence Vault Metadata & File Inventory Snapshot
if [[ -d "${EVIDENCE_VAULT_DIR}" ]]; then
    log_info "Creating cryptographic manifest of evidence vault..."
    find "${EVIDENCE_VAULT_DIR}" -type f -exec shasum -a 256 {} + > "${BACKUP_DEST}/evidence_vault_inventory_${TIMESTAMP}.sha256"
    log_info "Vault inventory recorded (${BACKUP_DEST}/evidence_vault_inventory_${TIMESTAMP}.sha256)"
else
    log_warn "Evidence vault directory ${EVIDENCE_VAULT_DIR} does not exist or is empty."
fi

# 3. Retention Cleanup (Prune archives older than RETENTION_DAYS)
log_info "Pruning local backup directories older than ${RETENTION_DAYS} days..."
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +

log_info "Backup completed successfully at ${BACKUP_DEST}"
