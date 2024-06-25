// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as path from 'path';
import * as dotenv from 'dotenv';
import { type ManagerConfig } from '@frmscoe/frms-coe-lib';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface IConfig {
  maxCPU: number;
  service: {
    port: number;
    host: string;
  };
  env: string;
  apm: {
    serviceName: string;
    secretToken: string;
    url: string;
    active: string;
  };
  db: ManagerConfig;
  logger: {
    logstashHost: string;
    logstashPort: number;
    logstashLevel: string;
  };
  sidecarHost: string;
  producerStream: string;
}

export const configuration: IConfig = {
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  service: {
    port: parseInt(process.env.PORT!, 10) || 3000,
    host: process.env.HOST! || '127.0.0.1',
  },
  apm: {
    serviceName: process.env.FUNCTION_NAME!,
    url: process.env.APM_URL!,
    secretToken: process.env.APM_SECRET_TOKEN!,
    active: process.env.APM_ACTIVE!,
  },
  db: {
    redisConfig: {
      db: parseInt(process.env.REDIS_DB!, 10) || 0,
      servers: JSON.parse(process.env.REDIS_SERVERS! || '[{"hostname": "127.0.0.1", "port":6379}]'),
      password: process.env.REDIS_AUTH!,
      isCluster: process.env.REDIS_IS_CLUSTER === 'true',
    },
    networkMap: {
      password: process.env.NETWORK_MAP_DATABASE_PASSWORD!,
      url: process.env.NETWORK_MAP_DATABASE_URL!,
      user: process.env.NETWORK_MAP_DATABASE_USER!,
      databaseName: process.env.NETWORK_MAP_DATABASE!,
      certPath: process.env.NETWORK_MAP_DATABASE_CERT_PATH!,
    },
    configuration: {
      password: process.env.CONFIG_DATABASE_PASSWORD!,
      url: process.env.CONFIG_DATABASE_URL!,
      user: process.env.CONFIG_DATABASE_USER!,
      databaseName: process.env.CONFIG_DATABASE!,
      certPath: process.env.CONFIG_DATABASE_CERT_PATH!,
      localCacheEnabled: process.env.CACHE_ENABLED === 'true',
      localCacheTTL: parseInt(process.env.CACHE_TTL!, 10) || 3000,
    },
    transactionHistory: {
      password: process.env.TRANSACTION_HISTORY_DATABASE_PASSWORD!,
      url: process.env.TRANSACTION_HISTORY_DATABASE_URL!,
      user: process.env.TRANSACTION_HISTORY_DATABASE_USER!,
      databaseName: process.env.TRANSACTION_HISTORY_DATABASE!,
      certPath: process.env.TRANSACTION_HISTORY_DATABASE_CERT_PATH!,
    },
    transaction: {
      password: process.env.TRANSACTION_DATABASE_PASSWORD!,
      url: process.env.TRANSACTION_DATABASE_URL!,
      user: process.env.TRANSACTION_DATABASE_USER!,
      databaseName: process.env.TRANSACTION_DATABASE!,
      certPath: process.env.TRANSACTION_DATABASE_CERT_PATH!,
    },
  },
  env: process.env.NODE_ENV!,
  logger: {
    logstashHost: process.env.LOGSTASH_HOST!,
    logstashPort: parseInt(process.env.LOGSTASH_PORT ?? '0', 10),
    logstashLevel: process.env.LOGSTASH_LEVEL! || 'info',
  },
  sidecarHost: process.env.SIDECAR_HOST!,
  producerStream: process.env.PRODUCER_STREAM!,
};
