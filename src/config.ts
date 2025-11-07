// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import type { ManagerConfig } from '@tazama-lf/frms-coe-lib';
import { type AdditionalConfig, type ProcessorConfig, validateProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

// Just we don't want everything, just what we are configuring, add more fields accordingly
export type AppDatabaseServices = Required<Pick<ManagerConfig, 'redisConfig' | 'eventHistory' | 'evaluation' | 'configuration'>>;

export type Configuration = ProcessorConfig & AppDatabaseServices & IConfig;

export interface IConfig {
  ACTIVE_CONDITIONS_ONLY: boolean;
  PORT: number;
  AUTHENTICATED: boolean;
  CORS_POLICY?: 'demo' | 'prod';
}

const additionalEnvironmentVariables: AdditionalConfig[] = [
  {
    name: 'ACTIVE_CONDITIONS_ONLY',
    type: 'boolean',
    optional: false,
  },
  {
    name: 'PORT',
    type: 'number',
    optional: false,
  },
  {
    name: 'AUTHENTICATED',
    type: 'boolean',
    optional: false,
  },
  {
    name: 'CORS_POLICY',
    type: 'string',
    optional: true,
  },
];

const processorConfig = validateProcessorConfig(additionalEnvironmentVariables) as Configuration;
export { processorConfig };
