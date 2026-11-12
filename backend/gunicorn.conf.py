"""
Production Gunicorn Configuration for ForenVision AI WSGI Server.
Configures worker concurrency, timeouts, memory recycling, security headers, and AI resource ceilings.
"""

import multiprocessing
import os

# Server Socket Binding
bind = os.getenv("GUNICORN_BIND", f"0.0.0.0:{os.getenv('PORT', '5001')}")
backlog = 2048

# Worker Concurrency & Class
# Default to (2 * cores + 1) or minimum 4 workers; gthread allows threaded I/O while running synchronous tasks
default_workers = max(2, min(8, multiprocessing.cpu_count() * 2 + 1))
workers = int(os.getenv("GUNICORN_WORKERS", default_workers))
worker_class = os.getenv("GUNICORN_WORKER_CLASS", "gthread")
threads = int(os.getenv("GUNICORN_THREADS", 2))

# Timeouts
# Forensic analysis, ELA, YOLOv4-tiny neural network inference, and PDF report generation
# require an adequate timeout window to complete without premature worker kill
timeout = int(os.getenv("GUNICORN_TIMEOUT", 120))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", 30))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", 5))

# Memory Management & Worker Recycling
# Periodically recycle workers to release native OpenCV raster memory and prevent bloat
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", 1000))
max_requests_jitter = int(os.getenv("GUNICORN_MAX_REQUESTS_JITTER", 50))

# Logging Configuration
accesslog = os.getenv("GUNICORN_ACCESS_LOG", "-")
errorlog = os.getenv("GUNICORN_ERROR_LOG", "-")
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" (%(D)s µs)'

# Reverse Proxy Integration
# Allow forwarded headers from Nginx or AWS ALB / GCP Cloud Run reverse proxies
forwarded_allow_ips = os.getenv("GUNICORN_FORWARDED_ALLOW_IPS", "*")
secure_scheme_headers = {"X-FORWARDED-PROTOCOL": "ssl", "X-FORWARDED-PROTO": "https", "X-FORWARDED-SSL": "on"}

# Process Identification
proc_name = "forenvision-api"


def post_fork(server, worker):
    """
    Hook executed immediately after a worker process has been forked.
    Applies AI thread ceilings to prevent OpenCV thread saturation across multiple workers.
    """
    try:
        import cv2
        num_threads = int(os.getenv("OPENCV_NUM_THREADS", 2))
        cv2.setNumThreads(num_threads)
        server.log.info(f"Worker {worker.pid}: OpenCV thread pool capped at {num_threads} threads.")
    except Exception as exc:  # pylint: disable=broad-exception-caught
        server.log.warning(f"Worker {worker.pid}: Could not configure OpenCV threads: {exc}")


def worker_abort(worker):
    """Hook executed when a worker receives a SIGABRT or timeout."""
    worker.log.error(f"Worker {worker.pid} received abort signal (possible timeout or out-of-memory).")
