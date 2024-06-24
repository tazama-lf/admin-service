ARG BUILD_IMAGE=node:20-bullseye
ARG RUN_IMAGE=gcr.io/distroless/nodejs20-debian11:nonroot

FROM ${BUILD_IMAGE} AS builder
LABEL stage=build
# TS -> JS stage

WORKDIR /home/app
COPY ./src ./src
COPY ./package*.json ./
COPY ./tsconfig.json ./
COPY ./swagger.yaml ./
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
COPY service.yaml ./
COPY deployment.yaml ./

# Turn down the verbosity to default level.
ENV NPM_CONFIG_LOGLEVEL warn

ENV mode="http"
ENV upstream_url="http://127.0.0.1:3000"
ENV exec_timeout="10s"
ENV write_timeout="15s"
ENV read_timeout="15s"
ENV prefix_logs="false"

# Service Based variables
ENV FUNCTION_NAME=transaction-monitoring-service
ENV NODE_ENV=production
ENV PORT=3000
ENV QUOTING=false
ENV SERVER_URL=
ENV MAX_CPU=

# Redis
ENV REDIS_DB=0
ENV REDIS_AUTH=
ENV REDIS_SERVERS=
ENV REDIS_IS_CLUSTER=

# Nats
ENV SERVER_URL=0.0.0.0:4222
ENV STARTUP_TYPE=nats
ENV PRODUCER_STREAM=
ENV ACK_POLICY=Explicit
ENV PRODUCER_STORAGE=File
ENV PRODUCER_RETENTION_POLICY=Workqueue

# Database
ENV TRANSACTION_HISTORY_DATABASE_CERT_PATH='/usr/local/share/ca-certificates/ca-certificates.crt'
ENV TRANSACTION_HISTORY_DATABASE_URL=
ENV TRANSACTION_HISTORY_DATABASE_USER='root'
ENV TRANSACTION_HISTORY_DATABASE_PASSWORD=

ENV TRANSACTION_HISTORY_DATABASE='transactionHistory'
ENV TRANSACTION_HISTORY_PAIN001_COLLECTION='transactionHistoryPain001'
ENV TRANSACTION_HISTORY_PAIN013_COLLECTION='transactionHistoryPain013'
ENV TRANSACTION_HISTORY_PACS008_COLLECTION='transactionHistoryPacs008'
ENV TRANSACTION_HISTORY_PACS002_COLLECTION='transactionHistoryPacs002'

ENV PSEUDONYMS_DATABASE_CERT_PATH=
ENV PSEUDONYMS_DATABASE='pseudonyms'
ENV PSEUDONYMS_DATABASE_USER='root'
ENV PSEUDONYMS_DATABASE_URL=
ENV PSEUDONYMS_DATABASE_PASSWORD=
ENV CACHE_TTL=30

# Apm
ENV APM_ACTIVE=true
ENV APM_SERVICE_NAME=transaction-monitoring-service
ENV APM_URL=http://apm-server.development.svc.cluster.local:8200/
ENV APM_SECRET_TOKEN=

# Logstash
ENV LOGSTASH_HOST=logstash.development.svc.cluster.local
ENV LOGSTASH_PORT=8080
ENV LOGSTASH_LEVEL='info'
ENV SIDECAR_HOST=0.0.0.0:5000

HEALTHCHECK --interval=60s CMD [ -e /tmp/.lock ] || exit 1
EXPOSE 4222

# Execute watchdog command
CMD ["build/index.js"]
