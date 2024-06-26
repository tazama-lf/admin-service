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
  service: {
    port: number;
    host: string;
  };
}

export const configuration: IConfig = {
  maxCPU: parseInt(process.env.MAX_CPU!, 10) || 1,
  env: process.env.NODE_ENV!,
  service: {
    port: parseInt(process.env.PORT!, 10) || 3000,
    host: process.env.HOST! || '127.0.0.1',
  },
};
