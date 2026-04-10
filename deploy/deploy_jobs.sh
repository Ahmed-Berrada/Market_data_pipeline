#!/usr/bin/env bash
# =============================================================================
# deploy_jobs.sh — Deploy Cloud Run Jobs + Cloud Scheduler
# =============================================================================
# Prerequisites:
#   1. gcloud CLI installed & authenticated
#   2. A GCP project with Cloud Run, Cloud Scheduler, Artifact Registry enabled
#   3. .env file with DATABASE_URL and X_CG_DEMO_API_KEY
#
# Usage:
#   chmod +x deploy/deploy_jobs.sh
#   ./deploy/deploy_jobs.sh
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${GCP_REGION:-europe-west1}"
REPO="market-pipeline"
IMAGE_NAME="pipeline-job"
IMAGE_TAG="latest"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

# Load secrets from .env
if [[ -f .env ]]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  Market Data Pipeline — Cloud Run Jobs Deployment"
echo "═══════════════════════════════════════════════════════════════"
echo "  Project:  ${PROJECT_ID}"
echo "  Region:   ${REGION}"
echo "  Image:    ${IMAGE_URI}"
echo ""

# ── 1. Create Artifact Registry repo (idempotent) ────────────────────────────
echo "► Creating Artifact Registry repo (if needed)..."
gcloud artifacts repositories create "${REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Market data pipeline images" \
    2>/dev/null || true

# ── 2. Build & push the Docker image ─────────────────────────────────────────
# ...existing code...

# ── 2. Build & push the Docker image ─────────────────────────────────────────
echo "► Building and pushing Docker image..."
gcloud builds submit \
    --config=/dev/stdin <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', '${IMAGE_URI}', '-f', 'Dockerfile.jobs', '.']
images:
  - '${IMAGE_URI}'
timeout: 600s
EOF
# ── 3. Create/update Cloud Run Jobs ──────────────────────────────────────────
echo "► Creating Cloud Run Job: stock-pipeline..."
gcloud run jobs create stock-pipeline \
    --image "${IMAGE_URI}" \
    --region "${REGION}" \
    --args="--pipeline,stocks" \
    --set-env-vars="DATABASE_URL=${DATABASE_URL}" \
    --memory=1Gi \
    --cpu=1 \
    --max-retries=2 \
    --task-timeout=300s \
    2>/dev/null || \
gcloud run jobs update stock-pipeline \
    --image "${IMAGE_URI}" \
    --region "${REGION}" \
    --args="--pipeline,stocks" \
    --set-env-vars="DATABASE_URL=${DATABASE_URL}" \
    --memory=1Gi \
    --cpu=1 \
    --max-retries=2 \
    --task-timeout=300s

echo "► Creating Cloud Run Job: crypto-pipeline..."
gcloud run jobs create crypto-pipeline \
    --image "${IMAGE_URI}" \
    --region "${REGION}" \
    --args="--pipeline,crypto" \
    --set-env-vars="DATABASE_URL=${DATABASE_URL},X_CG_DEMO_API_KEY=${X_CG_DEMO_API_KEY}" \
    --memory=512Mi \
    --cpu=1 \
    --max-retries=3 \
    --task-timeout=300s \
    2>/dev/null || \
gcloud run jobs update crypto-pipeline \
    --image "${IMAGE_URI}" \
    --region "${REGION}" \
    --args="--pipeline,crypto" \
    --set-env-vars="DATABASE_URL=${DATABASE_URL},X_CG_DEMO_API_KEY=${X_CG_DEMO_API_KEY}" \
    --memory=512Mi \
    --cpu=1 \
    --max-retries=3 \
    --task-timeout=300s

# ── 4. Create Cloud Scheduler triggers ───────────────────────────────────────
# Stocks: every 1 minute on weekdays (matches stock_dag.py)
echo "► Creating Cloud Scheduler: trigger-stock-pipeline..."
gcloud scheduler jobs delete trigger-stock-pipeline \
    --location="${REGION}" --quiet 2>/dev/null || true

gcloud scheduler jobs create http trigger-stock-pipeline \
    --location="${REGION}" \
    --schedule="*/1 * * * 1-5" \
    --time-zone="UTC" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/stock-pipeline:run" \
    --http-method=POST \
    --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
    --description="Trigger stock ETL every minute on weekdays"

# Crypto: every 20 minutes (matches crypto_dag.py, CoinGecko rate limits)
echo "► Creating Cloud Scheduler: trigger-crypto-pipeline..."
gcloud scheduler jobs delete trigger-crypto-pipeline \
    --location="${REGION}" --quiet 2>/dev/null || true

gcloud scheduler jobs create http trigger-crypto-pipeline \
    --location="${REGION}" \
    --schedule="*/20 * * * *" \
    --time-zone="UTC" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/crypto-pipeline:run" \
    --http-method=POST \
    --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
    --description="Trigger crypto ETL every 20 minutes"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✓ Deployment complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Cloud Run Jobs:"
echo "    • stock-pipeline  — runs every 1 min (weekdays)"
echo "    • crypto-pipeline — runs every 20 min"
echo ""
echo "  Useful commands:"
echo "    # Run a job manually:"
echo "    gcloud run jobs execute stock-pipeline --region ${REGION}"
echo "    gcloud run jobs execute crypto-pipeline --region ${REGION}"
echo ""
echo "    # Check execution logs:"
echo "    gcloud run jobs executions list --job stock-pipeline --region ${REGION}"
echo "    gcloud logging read 'resource.type=\"cloud_run_job\"' --limit=20"
echo ""
echo "    # Pause/resume schedulers:"
echo "    gcloud scheduler jobs pause trigger-stock-pipeline --location ${REGION}"
echo "    gcloud scheduler jobs resume trigger-stock-pipeline --location ${REGION}"
echo ""
