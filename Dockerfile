# SPDX-License-Identifier: Apache-2.0
ARG BUILD_IMAGE=node:20-bullseye
ARG RUN_IMAGE=gcr.io/distroless/nodejs20-debian11:nonroot

FROM ${BUILD_IMAGE} AS builder
LABEL stage=build
# TS -> JS stage

WORKDIR /home/app
COPY ./src ./src
COPY ./package*.json ./
COPY ./tsconfig.json ./
COPY .npmrc ./
ARG GH_TOKEN

RUN npm ci --ignore-scripts
RUN npm run build

FROM ${BUILD_IMAGE} AS dep-resolver
LABEL stage=pre-prod
# To filter out dev dependencies from final build

COPY package*.json ./
COPY .npmrc ./
ARG GH_TOKEN
RUN npm ci --omit=dev --ignore-scripts

FROM ${RUN_IMAGE} AS run-env
USER nonroot

WORKDIR /home/app
COPY --from=dep-resolver /node_modules ./node_modules
COPY --from=builder /home/app/build ./build
COPY package.json ./

# Turn down the verbosity to default level.
ENV NPM_CONFIG_LOGLEVEL warn

# Service Based variables
ENV FUNCTION_NAME=admin-service
ENV NODE_ENV=production
ENV PORT=3000
ENV MAX_CPU=1

# Database
ENV EVALUATION_DATABASE_CERT_PATH='/usr/local/share/ca-certificates/ca-certificates.crt'
ENV EVALUATION_DATABASE_URL=tcp://0.0.0.0:8529
ENV EVALUATION_DATABASE_USER=root
ENV EVALUATION_DATABASE_PASSWORD=
ENV EVALUATION_DATABASE=evaluationResults

ENV PSEUDONYMS_DATABASE_CERT_PATH='/usr/local/share/ca-certificates/ca-certificates.crt'
ENV PSEUDONYMS_DATABASE_URL=tcp://0.0.0.0:8529
ENV PSEUDONYMS_DATABASE_USER=root
ENV PSEUDONYMS_DATABASE_PASSWORD=
ENV PSEUDONYMS_DATABASE=pseudonyms

# REDIS
ENV REDIS_DATABASE=0
ENV REDIS_AUTH=
ENV REDIS_SERVERS=
ENV REDIS_IS_CLUSTER=
ENV DISTRIBUTED_CACHETTL=300
ENV DISTRIBUTED_CACHE_ENABLED=true

# Auth
ENV AUTHENTICATED=false
ENV CERT_PATH_PUBLIC=
ENV SIDECAR_HOST=0.0.0.0:5000

ENV ACTIVE_CONDITIONS_ONLY=false

CMD ["build/index.js"]
