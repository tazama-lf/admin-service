// SPDX-License-Identifier: Apache-2.0
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// config settings, env variables
import * as path from 'path';
import * as dotenv from 'dotenv';
import { type RedisConfig } from '@frmscoe/frms-coe-lib/lib/interfaces';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface IConfig {
  maxCPU: number;
  env: string;
  functionName: string;
  port: number;
  apm: {
    secretToken: string;
    serviceName: string;
    url: string;
    active: string;
  };
  graphDb: string;
  pseudonymsURL: string;
  pseudonymsUser: string;
  pseudonymsPassword: string;
  pseudonymsCertPath: string;
  transactionHistoryName: string;
  transactionHistoryPassword: string;
  transactionHistoryURL: string;
  transactionHistoryUser: string;
  transactionHistoryCertPath: string;
  transactionHistoryPain001Collection: string;
  transactionHistoryPain013Collection: string;
  transactionHistoryPacs008Collection: string;
  transactionHistoryPacs002Collection: string;
  cacheTTL: number;
  quoting: boolean;
  logger: {
    logstashHost: string;
    logstashPort: number;
    logstashLevel: string;
  };
  redis: RedisConfig;
  sidecarHost: string;
}

export const configuration: IConfig = {
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  quoting: process.env.QUOTING === 'true',
  apm: {
    serviceName: process.env.APM_SERVICE_NAME!,
    url: process.env.APM_URL!,
    secretToken: process.env.APM_SECRET_TOKEN!,
    active: process.env.APM_ACTIVE!,
  },
  cacheTTL: parseInt(process.env.CACHE_TTL!, 10) || 300,
  transactionHistoryCertPath: process.env.TRANSACTION_HISTORY_DATABASE_CERT_PATH!,
  graphDb: process.env.PSEUDONYMS_DATABASE!,
  transactionHistoryName: process.env.TRANSACTION_HISTORY_DATABASE!,
  transactionHistoryPain001Collection: process.env.TRANSACTION_HISTORY_PAIN001_COLLECTION!,
  transactionHistoryPain013Collection: process.env.TRANSACTION_HISTORY_PAIN013_COLLECTION!,
  transactionHistoryPacs008Collection: process.env.TRANSACTION_HISTORY_PACS008_COLLECTION!,
  transactionHistoryPacs002Collection: process.env.TRANSACTION_HISTORY_PACS002_COLLECTION!,
  transactionHistoryPassword: process.env.TRANSACTION_HISTORY_DATABASE_PASSWORD!,
  transactionHistoryURL: process.env.TRANSACTION_HISTORY_DATABASE_URL!,
  transactionHistoryUser: process.env.TRANSACTION_HISTORY_DATABASE_USER!,
  env: process.env.NODE_ENV!,
  functionName: process.env.FUNCTION_NAME!,
  logger: {
    logstashHost: process.env.LOGSTASH_HOST!,
    logstashPort: parseInt(process.env.LOGSTASH_PORT ?? '0', 10),
    logstashLevel: process.env.LOGSTASH_LEVEL! || 'info',
  },
  port: parseInt(process.env.PORT!, 10) || 3000,
  redis: {
    db: parseInt(process.env.REDIS_DB!, 10) || 0,
    servers: JSON.parse(process.env.REDIS_SERVERS! || '[{"hostname": "127.0.0.1", "port":6379}]'),
    password: process.env.REDIS_AUTH!,
    isCluster: process.env.REDIS_IS_CLUSTER === 'true',
  },
  sidecarHost: process.env.SIDECAR_HOST!,
  pseudonymsURL: process.env.PSEUDONYMS_DATABASE_URL!,
  pseudonymsUser: process.env.PSEUDONYMS_DATABASE_USER!,
  pseudonymsPassword: process.env.PSEUDONYMS_DATABASE_PASSWORD!,
  pseudonymsCertPath: process.env.PSEUDONYMS_DATABASE_CERT_PATH!,
};
