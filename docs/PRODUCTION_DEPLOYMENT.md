# ForenVision AI Production Deployment & Operations Guide

## 1. Architecture & Hosting Strategy

ForenVision AI is a multi-tier forensic intelligence application comprising a React/TypeScript frontend, a Python/Flask WSGI backend, a private filesystem evidence vault, and a MongoDB Atlas document database.

```
                      +-----------------------------+
                      |     Client Web Browser      |
                      +-----------------------------+
                                     |
                                     | HTTPS (Port 443 / TLS 1.3)
                                     v
                 +---------------------------------------+
                 |       Nginx Reverse Proxy / Edge      |
                 | - SSL Termination & HSTS              |
                 | - Rate Limiting (auth: 5r/s, api: 30r/s)|
                 | - Static Asset Serving (frontend/dist)|
                 | - Vault Access Denial (/uploads/ 403) |
                 +---------------------------------------+
                        |                         |
            /api/*      |                         | /assets/*, /*
     (Proxy Pass)       v                         v
+-------------------------------+       +--------------------------+
| Gunicorn WSGI Server (x4)     |       | Pre-compiled Static SPA  |
| - 4 Workers, 2 Threads        |       | (React 18 + Vite)        |
| - OpenCV Thread Pool Capped   |       +--------------------------+
| - Sensitive Data Log Scrubbing|
+-------------------------------+
       |                 |
       | Read/Write      | Strict Stream (0640 permissions)
       v                 v
+---------------+  +-----------------------------------------------+
| MongoDB Atlas |  | Private Cryptographic Evidence Vault          |
| Replica Set   |  | (/var/forenvision/evidence_vault)             |
| (TLS 1.2+)    |  | - Completely isolated from public web paths   |
+---------------+  | - Accessible ONLY via authenticated endpoints |
                   +-----------------------------------------------+
```

### Hosting Options Evaluation

| Hosting Model | Feasibility | Strengths | Trade-offs & Resource Requirements | Recommendation |
| :--- | :---: | :--- | :--- | :---: |
| **Option A: Containerized (Docker Compose / AWS ECS)** | **Optimal** | Clean separation of concerns, reproducible builds, isolated network, deterministic dependencies. | Requires Docker runtime and EBS/persistent volume for evidence vault. | **RECOMMENDED** |
| **Option B: Native Linux VM (Ubuntu 22.04 LTS / Systemd)** | **High** | Direct access to hardware resources, minimal virtualization overhead for OpenCV/DNN inferences. | Manual environment maintenance, requires system package updates. | Excellent for on-premises forensics labs |
| **Option C: Serverless / Cloud Run** | **Partial** | Auto-scaling to zero, low idle cost. | Cold starts during YOLO model loading; ephemeral storage incompatible with local evidence vault. | Not recommended for local vault |

---

## 2. Deployment Method A: Docker Compose (Recommended)

### Step 1: Clone Repository & Create Environment Configuration
```bash
cd /opt/forenvision

# Create production environment file from template
cp backend/.env.production.example backend/.env.production
chmod 600 backend/.env.production
```

Generate secure 64-character secrets and populate `backend/.env.production`:
```bash
# Generate high-entropy secrets
openssl rand -hex 32  # Use for SECRET_KEY
openssl rand -hex 32  # Use for JWT_SECRET_KEY
```

Configure `backend/.env.production`:
```ini
FLASK_ENV=production
FLASK_DEBUG=False
PORT=5001
SECRET_KEY=<GENERATED_64_CHAR_SECRET>
JWT_SECRET_KEY=<GENERATED_64_CHAR_JWT_SECRET>
JWT_ACCESS_TOKEN_EXPIRES_MINUTES=120
MONGODB_URI=mongodb+srv://forenvision_app_user:<PASSWORD>@your-cluster.mongodb.net/forenvision_db?retryWrites=true&w=majority
MONGODB_DB_NAME=forenvision_db
FRONTEND_ORIGIN=https://forenvision.example.com
UPLOAD_FOLDER=/var/forenvision/evidence_vault
LOG_DIR=/var/log/forenvision
```

### Step 2: Prepare Host Vault & Certificate Directories
```bash
sudo mkdir -p /var/forenvision/evidence_vault /var/log/forenvision /var/www/certbot
sudo chown -R 10001:10001 /var/forenvision/evidence_vault /var/log/forenvision
sudo chmod 700 /var/forenvision/evidence_vault /var/log/forenvision
```

### Step 3: Issue SSL Certificate via Let's Encrypt Certbot
```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d forenvision.example.com
```

### Step 4: Build & Launch Stack
```bash
# Build multi-stage container and start services
docker-compose -f docker-compose.prod.yml up -d --build

# Verify container health
docker-compose -f docker-compose.prod.yml ps
```

---

## 3. Deployment Method B: Native Systemd on Ubuntu / Debian

### Step 1: Install System Runtime Dependencies
```bash
sudo apt-get update && sudo apt-get install -y \
    python3.11 python3.11-venv python3-pip \
    libgl1 libglib2.0-0 nginx curl ca-certificates
```

### Step 2: Create Dedicated Forensic System User
```bash
sudo useradd -r -s /bin/false -d /opt/forenvision forenvision
sudo mkdir -p /opt/forenvision /var/forenvision/evidence_vault /var/log/forenvision
sudo chown -R forenvision:forenvision /opt/forenvision /var/forenvision/evidence_vault /var/log/forenvision
sudo chmod 700 /var/forenvision/evidence_vault /var/log/forenvision
```

### Step 3: Install Backend Dependencies
```bash
cd /opt/forenvision/backend
python3.11 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
```

### Step 4: Build Production Frontend
```bash
cd /opt/forenvision/frontend
npm ci
npm run build
sudo mkdir -p /var/www/forenvision/frontend
sudo cp -r dist /var/www/forenvision/frontend/
sudo chown -R www-data:www-data /var/www/forenvision/frontend
```

### Step 5: Configure Gunicorn Systemd Service
Create `/etc/systemd/system/forenvision.service`:
```ini
[Unit]
Description=ForenVision AI Production Gunicorn WSGI Service
After=network.target

[Service]
User=forenvision
Group=forenvision
WorkingDirectory=/opt/forenvision/backend
EnvironmentFile=/opt/forenvision/backend/.env.production
ExecStart=/opt/forenvision/backend/venv/bin/gunicorn -c gunicorn.conf.py wsgi:app
Restart=always
RestartSec=5
StandardOutput=append:/var/log/forenvision/gunicorn.log
StandardError=append:/var/log/forenvision/gunicorn.err.log

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now forenvision.service
sudo systemctl status forenvision.service
```

### Step 6: Configure Nginx Reverse Proxy
```bash
sudo cp /opt/forenvision/nginx/forenvision.conf /etc/nginx/sites-available/forenvision.conf
sudo cp /opt/forenvision/nginx/proxy_params_forenvision /etc/nginx/proxy_params_forenvision
sudo ln -s /etc/nginx/sites-available/forenvision.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. Verification & Health Check Runbook

Execute these automated checks immediately following deployment:

### 1. Process & Liveness Probe
```bash
curl -i https://forenvision.example.com/api/health
# Expected Output: HTTP 200 OK with "status": "healthy"
```

### 2. Database Connectivity & Readiness Probe
```bash
curl -i https://forenvision.example.com/api/health/db
# Expected Output: HTTP 200 OK with "status": "connected", "latency_ms": <50, "indexes_ready": true
```

### 3. Verify Security Headers
```bash
curl -I https://forenvision.example.com/
# Verify presence of:
# - Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# - X-Frame-Options: DENY
# - X-Content-Type-Options: nosniff
# - Referrer-Policy: strict-origin-when-cross-origin
```

### 4. Verify Evidence Vault Access Denial (403 Forbidden)
```bash
curl -I https://forenvision.example.com/uploads/vault/
# Expected Output: HTTP 403 Forbidden (Nginx blocks direct vault traversal)
```

---

## 5. Zero-Downtime Updates & Rollback Procedures

### Zero-Downtime Rolling Update (Docker)
```bash
# 1. Pull updated codebase
git pull origin main

# 2. Build new image with updated tag
docker build -t forenvision-api:v2.1.0 .

# 3. Update docker-compose image tag and recreate API container
docker-compose -f docker-compose.prod.yml up -d --no-deps api

# 4. Confirm health
docker-compose -f docker-compose.prod.yml exec api curl -f http://localhost:5001/api/health
```

### Fast Rollback Procedure
If unexpected errors or performance anomalies occur post-deployment:

```bash
# Step 1: Revert container image to previous stable tag
docker-compose -f docker-compose.prod.yml down api
# Switch tag in docker-compose.prod.yml back to previous stable release (e.g., v2.0.0)
docker-compose -f docker-compose.prod.yml up -d api

# Step 2: Systemd Native Rollback
sudo systemctl stop forenvision.service
git checkout <PREVIOUS_STABLE_COMMIT_HASH>
sudo systemctl start forenvision.service

# Step 3: Verify system restoration
curl -f https://forenvision.example.com/api/health
```

---

## 6. Production Security Checklist

| Category | Security Control | Verification | Status |
| :--- | :--- | :--- | :---: |
| **Secrets** | Zero hardcoded credentials; all keys loaded via environment variables | Verified via Git audit and `.gitignore` exclusion | ✅ Verified |
| **Database** | MongoDB connection string masked in all log outputs (`***:***@host`) | Verified via `test_db_service.py` and Gunicorn log inspection | ✅ Verified |
| **Database** | TLS 1.2+ encryption in transit to MongoDB Atlas cluster | Enforced via `mongodb+srv://` schema | ✅ Verified |
| **WSGI** | Flask development server disabled; production Gunicorn server active | Verified via `wsgi.py` and `gunicorn.conf.py` | ✅ Verified |
| **CORS** | Strict restriction to authorized origins; `*` wildcard rejected in production | Verified via `test_cors.py` and `ProductionConfig` validation | ✅ Verified |
| **Vault** | Evidence files stored in air-gapped directory with `0640` permissions | Verified via `EvidenceService.store_evidence()` | ✅ Verified |
| **Vault** | Direct HTTP access to `/uploads/` strictly blocked at Nginx level | Configured in `nginx/forenvision.conf` (`deny all; return 403;`) | ✅ Verified |
| **Vault** | No-cache headers (`no-store, no-cache`) on all evidence download endpoints | Verified in `app.py` `after_request` handler | ✅ Verified |
| **AI Resources** | OpenCV internal thread pool capped at 2 threads per worker | Configured via `cv2.setNumThreads(2)` in `gunicorn.conf.py` | ✅ Verified |
| **Safety Limits** | Maximum upload size capped at 20 MB; image decompression bomb limit 100 MP | Verified in `config.py` and Pillow `MAX_IMAGE_PIXELS` | ✅ Verified |
| **Logging** | Sensitive tokens, passwords, and connection strings redacted from log files | Verified via `SensitiveDataFilter` in `app.py` | ✅ Verified |

---

## 7. Known Limitations & Operational Considerations

1. **CPU vs. GPU Inference**: YOLOv4-tiny object localization and SIFT biometric matching run via OpenCV CPU inference. Under heavy concurrent load ($\ge 20$ simultaneous analytical requests), CPU utilization will increase. For high-throughput environments ($> 100$ requests/minute), provision multi-core servers (8+ vCPUs) or attach an NVIDIA GPU with OpenCV CUDA support.
2. **Database Network Latency**: MongoDB Atlas should be hosted in the same cloud region (e.g., AWS `us-east-1` or GCP `us-central1`) as the application host to ensure database ping latency remains $< 5\text{ms}$.
3. **Local Storage Scalability**: The local evidence vault volume should be mounted on a high-IOPS expandable SSD volume (e.g., AWS EBS `gp3`). Plan storage capacity based on expected case intake volume ($\sim 5\text{MB}$ per photographic evidence item).
