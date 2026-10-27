#!/bin/sh
# Build from source with Cloud Build and deploy one always-on Cloud Run instance.
# Usage: PROJECT=... REGION=us-central1 BUCKET=... PUBLIC_URL=... ./deploy/deploy.sh
set -e
: "${PROJECT:?set PROJECT}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-somm}"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" --region "$REGION" --source . \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 --concurrency 80 \
  --cpu 1 --memory 1Gi --no-cpu-throttling --timeout 900 \
  --set-env-vars "LITESTREAM_BUCKET=${BUCKET},PUBLIC_URL=${PUBLIC_URL},QLOO_BASE_URL=https://hackathon.api.qloo.com,LLM_BASE_URL=${LLM_BASE_URL:-https://api.venice.ai/api/v1},LLM_MODEL=${LLM_MODEL}" \
  --set-secrets "QLOO_API_KEY=somm-qloo-key:latest,LLM_API_KEY=somm-llm-key:latest"
