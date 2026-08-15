# Build the frontend, then serve it from the Python app — one image, one
# process, one origin (so no CORS and no second deploy to keep in sync).

FROM node:22-slim AS web
WORKDIR /web
# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build


FROM python:3.13-slim
WORKDIR /srv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY server/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server/app ./app
COPY --from=web /web/dist ./static

# STATIC_DIR turns on frontend serving; DATABASE_PATH points into the Fly
# volume mounted at /data. Both are overridable via fly.toml [env].
ENV STATIC_DIR=/srv/static \
    DATABASE_PATH=/data/bjj-notes.db

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
