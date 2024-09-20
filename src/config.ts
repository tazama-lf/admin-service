// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as path from 'path';
import * as dotenv from 'dotenv';
import { type ManagerConfig } from '@tazama-lf/frms-coe-lib';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

// Just we don't want everything, just what we are configuring, add more fields accordingly
export type AppDatabaseServices = Pick<ManagerConfig, 'redisConfig' | 'pseudonyms' | 'transaction'>;

export interface IConfig {
  maxCPU: number;
  env: string;
  activeConditionsOnly: boolean;
  service: {
    port: number;
    host: string;
  };
  db: Required<AppDatabaseServices>;
  cacheTTL: number;
  authentication: boolean;
}

export const configuration: IConfig = {
  cacheTTL: parseInt(process.env.CACHE_TTL!, 10) || 1000,
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  env: process.env.NODE_ENV!,
  activeConditionsOnly: process.env.ACTIVE_CONDITIONS_ONLY === 'true',
  authentication: process.env.AUTHENTICATED === 'true',
  service: {
    port: parseInt(process.env.PORT!, 10) || 3000,
    host: process.env.HOST! || '127.0.0.1',
  },
  db: {
    transaction: {
      password: process.env.TRANSACTION_DATABASE_PASSWORD!,
      url: process.env.TRANSACTION_DATABASE_URL!,
      user: process.env.TRANSACTION_DATABASE_USER!,
      databaseName: process.env.TRANSACTION_DATABASE!,
      certPath: process.env.TRANSACTION_DATABASE_CERT_PATH!,
    },
    pseudonyms: {
      url: process.env.PSEUDONYMS_DATABASE_URL!,
      databaseName: process.env.PSEUDONYMS_DATABASE!,
      user: process.env.PSEUDONYMS_DATABASE_USER!,
      password: process.env.PSEUDONYMS_DATABASE_PASSWORD!,
      certPath: process.env.PSEUDONYMS_DATABASE_CERT_PATH!,
    },
    redisConfig: {
      db: parseInt(process.env.VALKEY_DB!, 10) || 0,
      servers: JSON.parse(process.env.VALKEY_SERVERS! || '[{"hostname": "127.0.0.1", "port":6379}]'),
      password: process.env.VALKEY_AUTH!,
      isCluster: process.env.VALKEY_IS_CLUSTER === 'true',
    },
  },
};
