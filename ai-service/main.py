"""
Entry point for the recruitment AI microservice.

Run locally:
    pip install -r requirements.txt
    python main.py

Or:
    uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --reload
"""

import logging
import uvicorn

from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=True,
    )
