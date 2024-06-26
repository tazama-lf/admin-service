// SPDX-License-Identifier: Apache-2.0
// config settings, env variables
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env file into process.env if it exists. This is convenient for running locally.
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

export interface IConfig {
  maxCPU: number;
  env: string;
  sidecarHost: string;
  service: {
    port: number;
    host: string;
  };
  apm: {
    serviceName: string;
    secretToken: string;
    url: string;
    active: string;
  };
  db: {
    transaction: {
      password: string;
      url: string;
      user: string;
      databaseName: string;
      certPath: string;
    },
  };
  logger: {
    logstashHost: string;
    logstashPort: number;
    logstashLevel: string;
  };
}

export const configuration: IConfig = {
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  env: process.env.NODE_ENV!,
  sidecarHost: process.env.SIDECAR_HOST!,
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
    transaction: {
      password: process.env.TRANSACTION_DATABASE_PASSWORD!,
      url: process.env.TRANSACTION_DATABASE_URL!,
      user: process.env.TRANSACTION_DATABASE_USER!,
      databaseName: process.env.TRANSACTION_DATABASE!,
      certPath: process.env.TRANSACTION_DATABASE_CERT_PATH!,
    },
  },
  logger: {
    logstashHost: process.env.LOGSTASH_HOST!,
    logstashPort: parseInt(process.env.LOGSTASH_PORT ?? '0', 10),
    logstashLevel: process.env.LOGSTASH_LEVEL! || 'info',
  },
};
