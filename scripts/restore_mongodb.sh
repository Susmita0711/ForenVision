#!/usr/bin/env bash
# ==============================================================================
# ForenVision AI Production Database Restoration Script
# Validates archive SHA-256 integrity and performs mongorestore.
# ==============================================================================
set -euo pipefail

log_info() { echo -e "\033[32m[INFO]\033[0m $(date -u +"%Y-%m-%d %H:%M:%SZ") - $1"; }
log_warn() { echo -e "\033[33m[WARN]\033[0m $(date -u +"%Y-%m-%d %H:%M:%SZ") - $1"; }
log_err()  { echo -e "\033[31m[ERROR]\033[0m $(date -u +"%Y-%m-%d %H:%M:%SZ") - $1" >&2; }

if [[ $# -lt 1 ]]; then
    log_err "Usage: $0 <path_to_archive.archive.gz>"
    exit 1
fi

ARCHIVE_PATH="$1"

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
    log_err "Archive file '${ARCHIVE_PATH}' does not exist."
    exit 1
fi

if [[ -z "${MONGODB_URI:-}" ]]; then
    log_err "MONGODB_URI environment variable is not defined. Aborting restoration."
    exit 1
fi

if ! command -v mongorestore &> /dev/null; then
    log_err "'mongorestore' command not found. Install mongodb-database-tools package."
    exit 1
fi

# Check for corresponding sha256 checksum file
CHECKSUM_FILE="${ARCHIVE_PATH}.sha256"
if [[ -f "${CHECKSUM_FILE}" ]]; then
    log_info "Verifying SHA-256 cryptographic checksum..."
    cd "$(dirname "${ARCHIVE_PATH}")"
    if command -v sha256sum &> /dev/null; then
        sha256sum -c "$(basename "${CHECKSUM_FILE}")"
    else
        shasum -a 256 -c "$(basename "${CHECKSUM_FILE}")"
    fi
    log_info "Archive checksum verified. Zero corruption detected."
else
    log_warn "No checksum file found at '${CHECKSUM_FILE}'. Proceeding without pre-verification."
fi

log_warn "===================================================================="
log_warn "WARNING: This operation will restore database state from archive."
log_warn "Target Database URI: ${MONGODB_URI}"
log_warn "===================================================================="
read -p "Type 'RESTORE' to execute restoration: " CONFIRMATION

if [[ "${CONFIRMATION}" != "RESTORE" ]]; then
    log_info "Restoration aborted by operator."
    exit 0
fi

log_info "Executing mongorestore..."
mongorestore \
    --uri="${MONGODB_URI}" \
    --gzip \
    --archive="${ARCHIVE_PATH}" \
    --drop

log_info "Database successfully restored from ${ARCHIVE_PATH}."
