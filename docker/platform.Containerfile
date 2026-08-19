
# Official node:22.22.3-bookworm-slim OCI index, resolved 2026-07-27.
# linux/amd64 resolves to sha256:16d364eebf6b62da439dc993d9b80940c78b0ca38438452f011ab9a25c752644.
ARG NODE_BASE_IMAGE=node:22.22.3-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752
ARG RUNTIME_PLATFORM=linux/amd64

FROM --platform=${RUNTIME_PLATFORM} ${NODE_BASE_IMAGE} AS production-dependencies

WORKDIR /opt/sdg

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

FROM --platform=${RUNTIME_PLATFORM} ${NODE_BASE_IMAGE} AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    WIKI_HOST=0.0.0.0 \
    WIKI_PORT=3001 \
    APP_DATA_DIR=/var/lib/sdg/data \
    APP_SKILLS_DIR=/var/lib/sdg/skills \
    UNIT_TEST_CASE_PROJECT_ADDON_ROOT=/var/lib/sdg/project-addons \
    HOME=/var/lib/sdg/home \
    TMPDIR=/tmp \
    HERMES_TRANSPORT=api \
    MATLAB_MCP_TRANSPORT=http

WORKDIR /opt/sdg

COPY --from=production-dependencies --chown=node:node /opt/sdg/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node \
  src/app.js \
  src/config.js \
  src/server.js \
  src/wiki-server.js \
  ./src/
COPY --chown=node:node src/wiki ./src/wiki
COPY --chown=node:node \
  src/services/benchmark-case-service.js \
  src/services/benchmark-evaluation-service.js \
  src/services/c-extractor.js \
  src/services/case-alignment-service.js \
  src/services/extraction-service.js \
  src/services/feedback-ticket-service.js \
  src/services/golden-structurer-service.js \
  src/services/hermes-agent-client.js \
  src/services/hermes-command.js \
  src/services/hermes-task-queue-service.js \
  src/services/llm-profile-service.js \
  src/services/llm-service.js \
  src/services/matlab-mcp-client.js \
  src/services/model-fact-bundle.js \
  src/services/model-requirement-view-service.js \
  src/services/module-skill-bootstrap-llm-service.js \
  src/services/module-skill-service.js \
  src/services/openai-compatible-chat.js \
  src/services/pdf-extractor.js \
  src/services/pipeline-service.js \
  src/services/project-service.js \
  src/services/rejection-service.js \
  src/services/replay-artifact-service.js \
  src/services/replay-lab-service.js \
  src/services/replay-task-service.js \
  src/services/satk-model-fact-builder.js \
  src/services/skill-bundle-service.js \
  src/services/skill-database-service.js \
  src/services/skill-loader.js \
  src/services/skill-management-service.js \
  src/services/skill-refinement-audit-service.js \
  src/services/skill-refinement-service.js \
  src/services/skill-registry-service.js \
  src/services/skill-rule-service.js \
  src/services/skill-work-order-service.js \
  src/services/slx-model-analysis-service.js \
  src/services/slx-model-fact-adapter.js \
  src/services/software-detail-pipeline-contract.js \
  src/services/software-detail-artifact-name.js \
  src/services/software-detail-stage-catalog.js \
  src/services/software-module-description-generation-service.js \
  src/services/software-requirement-agent-shared.js \
  src/services/software-requirement-markdown-agent-service.js \
  src/services/spreadsheet-extraction-service.js \
  src/services/storage.js \
  src/services/tcsd-pipeline-contract.js \
  src/services/template-service.js \
  src/services/unit-test-case-generation-service.js \
  src/services/upload-filename.js \
  src/services/validation-service.js \
  src/services/zip-archive.js \
  ./src/services/
COPY --chown=node:node public ./public
COPY --chown=node:node wiki ./wiki
COPY --chown=node:node templates ./templates

# Platform skill seeds are deliberately enumerated. skills/hermes contains the
# Worker-only TCSD runtime, MATLAB assets, and stage skills and is never copied.
COPY --chown=node:node skills/active/domain-knowledge.json ./seed-skills/active/domain-knowledge.json
COPY --chown=node:node skills/active/examples ./seed-skills/active/examples
COPY --chown=node:node skills/active/profiles ./seed-skills/active/profiles
COPY --chown=node:node skills/active/requirement_extraction.md ./seed-skills/active/requirement_extraction.md
COPY --chown=node:node skills/active/requirement_validation.md ./seed-skills/active/requirement_validation.md
COPY --chown=node:node skills/active/requirement_writing.md ./seed-skills/active/requirement_writing.md
COPY --chown=node:node skills/active/skill-manifest.json ./seed-skills/active/skill-manifest.json
COPY --chown=node:node skills/bundles ./seed-skills/bundles
COPY --chown=node:node skills/examples ./seed-skills/examples
COPY --chown=node:node skills/domain-knowledge.json ./seed-skills/domain-knowledge.json
COPY --chown=node:node skills/requirement_extraction.md ./seed-skills/requirement_extraction.md
COPY --chown=node:node skills/requirement_validation.md ./seed-skills/requirement_validation.md
COPY --chown=node:node skills/requirement_writing.md ./seed-skills/requirement_writing.md

COPY --chown=node:node docker/platform-entrypoint.mjs ./docker/platform-entrypoint.mjs
COPY --chown=node:node docker/platform-healthcheck.mjs ./docker/platform-healthcheck.mjs

RUN mkdir -p \
      /var/lib/sdg/data \
      /var/lib/sdg/skills \
      /var/lib/sdg/project-addons \
      /var/lib/sdg/home \
    && chown -R node:node /var/lib/sdg

ARG IMAGE_REVISION=unknown
ARG IMAGE_VERSION=0.1.0-container
LABEL org.opencontainers.image.title="Software Document Generator Platform" \
      org.opencontainers.image.description="Frontend, backend, Wiki, scheduling, and Worker routing" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.source="https://github.com/uaapple/software-doc-generator-prototype"

USER node

EXPOSE 3000 3001
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "docker/platform-healthcheck.mjs"]

ENTRYPOINT ["node", "docker/platform-entrypoint.mjs"]
