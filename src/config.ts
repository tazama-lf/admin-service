// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as path from 'path';
import * as dotenv from 'dotenv';
import { type ManagerConfig } from '@tazama-lf/frms-coe-lib';
import { validateProcessorConfig, validateEnvVar, validateDatabaseConfig } from '@tazama-lf/frms-coe-lib/lib/helpers/env';
import { Database } from '@tazama-lf/frms-coe-lib/lib/helpers/env/database.config';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

// Just we don't want everything, just what we are configuring, add more fields accordingly
export type AppDatabaseServices = Pick<ManagerConfig, 'redisConfig' | 'pseudonyms' | 'transaction'>;

const generalConfig = validateProcessorConfig();
const authEnabled = generalConfig.nodeEnv === 'production';

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
  cacheTTL: validateEnvVar<number>('CACHETTL', 'number', true) || 1000,
  maxCPU: generalConfig.maxCPU,
  env: generalConfig.nodeEnv,
  activeConditionsOnly: validateEnvVar<boolean>('ACTIVE_CONDITIONS_ONLY', 'boolean'),
  authentication: validateEnvVar<boolean>('AUTHENTICATED', 'boolean'),
  service: {
    port: validateEnvVar<number>('PORT', 'string', true) || 3000,
    host: validateEnvVar<string>('HOST', 'string', true) || '127.0.0.1',
  },
  db: {
    transaction: validateDatabaseConfig(authEnabled, Database.TRANSACTION),
    pseudonyms: validateDatabaseConfig(authEnabled, Database.PSEUDONYMS),
    redisConfig: {
      db: validateEnvVar<number>('VALKEY_DB', 'number'),
      servers: JSON.parse(validateEnvVar<string>('VALKEY_SERVERS', 'string', true) || '[{"hostname": "127.0.0.1", "port":6379}]'),
      password: validateEnvVar<string>('VALKEY_AUTH', 'string'),
      isCluster: validateEnvVar('VALKEY_IS_CLUSTER', 'boolean'),
      distributedCacheEnabled: validateEnvVar('DISTRIBUTED_CACHE_ENABLED', 'boolean', true),
      distributedCacheTTL: validateEnvVar('DISTRIBUTED_CACHETTL', 'number', true),
    },
  },
};
