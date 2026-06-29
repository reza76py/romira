#!/bin/bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "=== Pulling latest code ==="
git fetch origin main && git reset --hard origin/main

echo "=== Building Docker images ==="
docker compose build --no-cache

echo "=== Stopping old containers ==="
docker stop romira-frontend romira-backend romira-db 2>/dev/null || true
docker rm romira-frontend romira-backend romira-db 2>/dev/null || true

echo "=== Starting containers ==="
docker compose up -d

echo "=== Waiting for database ==="
sleep 15

echo "=== Running migrations ==="
docker compose exec -T romira-backend python -c "
from database import engine
import models
models.Base.metadata.create_all(bind=engine)
print('Tables created.')
"

echo "=== Seeding data ==="
docker compose exec -T romira-backend python seed.py

echo "=== Deployment complete! ==="