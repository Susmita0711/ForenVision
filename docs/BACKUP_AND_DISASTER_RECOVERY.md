# ForenVision AI Backup & Disaster Recovery Runbook

## 1. Objectives & Metrics

| Metric | Target | Description |
| :--- | :--- | :--- |
| **RPO (Recovery Point Objective)** | **$\le$ 15 minutes** | Maximum allowable data loss window in a disaster. Met via MongoDB Atlas continuous oplog tailing and PITR. |
| **RTO (Recovery Time Objective)** | **$\le$ 60 minutes** | Maximum acceptable duration to restore service availability. |
| **Integrity Assurance** | **100% SHA-256 match** | All restored evidence artifacts and database archives must cryptographically match their ingestion hashes. |

---

## 2. Backup Architecture

```
+-----------------------------------------------------------------------------------+
|                            ForenVision AI Production Stack                        |
+-----------------------------------------------------------------------------------+
       |                                                              |
       v                                                              v
+------------------------+                                   +----------------------+
| MongoDB Atlas Database |                                   | Evidence Vault       |
| (M10+ Dedicated Cluster)|                                  | (/var/forenvision/...)
+------------------------+                                   +----------------------+
       |                                                              |
       +---> [1] Continuous Backups (PITR 1-min granularity)          +---> [1] AWS EBS Snapshot
       |                                                              |     (Daily automated)
       +---> [2] Nightly mongodump script                             |
             (`scripts/backup_mongodb.sh`)                            +---> [2] Off-site S3 WORM
                   |                                                        (Object Lock enabled)
                   v                                                              |
             +--------------------------------------------------------------------+
             | Offsite Encrypted Cold Storage (AES-256, Multi-Region)              |
             +--------------------------------------------------------------------+
```

---

## 3. Automated Backup Procedures

### 3.1. MongoDB Database Backup (`scripts/backup_mongodb.sh`)

Execute via cron daily at 02:00 UTC:

```bash
# Add to crontab: crontab -e
0 2 * * * /app/scripts/backup_mongodb.sh >> /var/log/forenvision/backup.log 2>&1
```

The script:
1. Connects to `MONGODB_URI` securely without logging credentials.
2. Creates an archive dump: `mongodb_dump_<TIMESTAMP>.archive.gz`.
3. Computes and saves SHA-256 hash manifest.
4. Snapshots file paths and checksums of the private evidence vault.
5. Prunes backups older than 30 days (`RETENTION_DAYS=30`).

### 3.2. Evidence Vault File Backup

Because evidence files are immutable once written, file backups leverage incremental synchronization and block-level snapshots:

```bash
# Nightly rsync to off-site archival volume
rsync -avz --delete \
    /var/forenvision/evidence_vault/ \
    backup-user@backup-server.internal:/var/backups/forenvision/vault/
```

For AWS/GCP deployments:
- **AWS**: Configure automated AWS Data Lifecycle Manager (DLM) policy to take daily EBS snapshots of the evidence volume with 90-day retention.
- **S3 Glacier**: Sync evidence files to an S3 bucket configured with **S3 Object Lock** in Compliance Mode to enforce Write-Once-Read-Many (WORM) legal immutability.

---

## 4. Disaster Recovery Playbooks

### 4.1. Scenario 1: MongoDB Database Failure / Oplog Restoration

To restore to a specific point in time using Atlas:
1. Navigate to **MongoDB Atlas Console** $\rightarrow$ **Clusters** $\rightarrow$ **Backup**.
2. Select **Point-in-Time Restore**.
3. Choose the target restoration timestamp (prior to failure).
4. Restore to a new cluster or clone over the existing database.
5. Update `MONGODB_URI` in `.env.production` if cluster endpoint changed.
6. Run `docker-compose -f docker-compose.prod.yml restart api`.
7. Verify health: `curl -f http://localhost:5001/api/health/db`.

To restore from a local `mongodump` archive using [`scripts/restore_mongodb.sh`](file:///Users/abir/Coding/Forenvision/scripts/restore_mongodb.sh):
```bash
# 1. Verify archive integrity and restore
./scripts/restore_mongodb.sh /var/backups/forenvision/20261020_020000Z/mongodb_dump_20261020_020000Z.archive.gz

# 2. Re-verify database connectivity and indexes
curl http://localhost:5001/api/health/db
```

### 4.2. Scenario 2: Evidence Vault Disk Failure

1. Provision replacement volume with minimum 500 GB SSD storage.
2. Format with ext4 / XFS and mount to `/var/forenvision/evidence_vault`.
3. Restore vault contents from latest snapshot:
   ```bash
   rsync -avz \
       backup-user@backup-server.internal:/var/backups/forenvision/vault/ \
       /var/forenvision/evidence_vault/
   ```
4. Restore strict forensic permissions:
   ```bash
   chown -R forenvision:forenvision /var/forenvision/evidence_vault
   chmod 700 /var/forenvision/evidence_vault
   find /var/forenvision/evidence_vault -type f -exec chmod 640 {} +
   ```
5. Trigger automated integrity audit via API:
   ```bash
   # Iterate evidence records and trigger POST /api/evidence/:id/verify
   ```

### 4.3. Scenario 3: Suspected Tampering / Ransomware

1. Immediately isolate host from network:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default deny outgoing
   ```
2. Export audit logs from cold storage replica to forensic workstation.
3. Compare on-disk evidence files against the SHA-256 baseline manifest:
   ```bash
   find /var/forenvision/evidence_vault -type f -exec shasum -a 256 {} + > /tmp/current_hashes.txt
   diff -u /var/backups/forenvision/latest/evidence_vault_inventory_*.sha256 /tmp/current_hashes.txt
   ```
4. Any mismatch indicates unauthorized modification or bitrot; flag in `audit_logs` and restore affected files from cold WORM storage.

---

## 5. Periodic Restoration Drill Protocol

- **Frequency**: Conduct bi-annual disaster recovery drills in an isolated staging environment.
- **Verification Criteria**:
  1. Complete database restore from archive must finish in $< 30$ minutes.
  2. Index initialization must complete without errors.
  3. All 129 backend integration tests must pass against the restored dataset.
  4. At least 10 randomly sampled evidence files must match their SHA-256 intake digests.
