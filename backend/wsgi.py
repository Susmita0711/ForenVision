"""
WSGI Entrypoint for ForenVision AI Production Backend.
Compatible with Gunicorn, uWSGI, Waitress, and containerized WSGI runtimes.
"""

import os
from app import create_app

# Default to production configuration when started via WSGI server
env_name = os.getenv("FLASK_ENV", "production")
app = create_app(env_name)
application = app  # Standard alias for WSGI servers

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    print(f"Starting ForenVision AI WSGI runner on port {port} (Environment: {env_name})...")
    app.run(host="0.0.0.0", port=port)
