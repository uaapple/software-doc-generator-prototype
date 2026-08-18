# syntax=docker/dockerfile:1.7
# Linux/amd64 TCSD Platform backend (role=platform). Serves the web UI and the
# API; generation tasks are dispatched to the DSH Worker container over
# HERMES_TRANSPORT=api + HERMES_BASE_URL (unchanged platform architecture).
ARG NODE_BASE_IMAGE="node:22.22.3-bookworm-slim"

FROM ${NODE_BASE_IMAGE} AS dependencies
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM ${NODE_BASE_IMAGE} AS runtime
ENV NODE_ENV="production" \
    APP_RUNTIME_ROLE="platform" \
    APP_DATA_DIR="/var/lib/sdg/data" \
    HERMES_TRANSPORT="api" \
    HERMES_HOST="0.0.0.0"

COPY --from=dependencies /usr/local/bin/node /usr/local/bin/node
COPY --from=dependencies /usr/local/lib/node_modules/ /usr/local/lib/node_modules/
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && test "$(node --version)" = "v22.22.3"

WORKDIR /opt/sdg/platform
COPY package.json package-lock.json ./
COPY --from=dependencies /build/node_modules ./node_modules
COPY src ./src
COPY public ./public
COPY docs ./docs
COPY skills/hermes/tcsd-runtime/scripts ./skills/hermes/tcsd-runtime/scripts
COPY skills/hermes/tcsd-stage-01-validate-inputs ./skills/hermes/tcsd-stage-01-validate-inputs
COPY skills/hermes/tcsd-stage-02-check-environment ./skills/hermes/tcsd-stage-02-check-environment
COPY skills/hermes/tcsd-stage-03-initialize-workspace ./skills/hermes/tcsd-stage-03-initialize-workspace
COPY skills/hermes/tcsd-stage-04-extract-interface ./skills/hermes/tcsd-stage-04-extract-interface
COPY skills/hermes/tcsd-stage-05-analyze-coverage ./skills/hermes/tcsd-stage-05-analyze-coverage
COPY skills/hermes/tcsd-stage-06-validate-state-probes ./skills/hermes/tcsd-stage-06-validate-state-probes
COPY skills/hermes/tcsd-stage-07-build-initial-cases ./skills/hermes/tcsd-stage-07-build-initial-cases
COPY skills/hermes/tcsd-stage-08-simulate-backfill ./skills/hermes/tcsd-stage-08-simulate-backfill
COPY skills/hermes/tcsd-stage-09-collect-coverage ./skills/hermes/tcsd-stage-09-collect-coverage
COPY skills/hermes/tcsd-stage-10-repair-coverage ./skills/hermes/tcsd-stage-10-repair-coverage
COPY skills/hermes/tcsd-stage-11-final-validation ./skills/hermes/tcsd-stage-11-final-validation
COPY skills/hermes/tcsd-stage-12-package-cleanup ./skills/hermes/tcsd-stage-12-package-cleanup

RUN mkdir -p /var/lib/sdg/data && chown -R 10001:10001 /var/lib/sdg/data /opt/sdg/platform

ARG IMAGE_REVISION=unknown
ARG IMAGE_VERSION=0.1.0-container
LABEL org.opencontainers.image.title="Software Document Generator TCSD Platform Backend" \
      org.opencontainers.image.revision="${IMAGE_REVISION}" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.licenses="MIT"

USER 10001:10001
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
