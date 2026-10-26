# One container: the FastAPI backend (4 agents) also serves the built 3D frontend.

# 1) Build the React + three.js frontend
FROM node:22-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2) Python API that serves /api/* and the built frontend at /
FROM python:3.14-slim
ENV PYTHONUNBUFFERED=1 PYDANTIC_AI_NO_BANNER=1
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
RUN mkdir -p backend/data
WORKDIR /app/backend
# Render provides $PORT; one worker keeps SQLite writes simple
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
