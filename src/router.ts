// SPDX-License-Identifier: Apache-2.0
import { type FastifyInstance } from 'fastify';
import { ReportRequestHandler, handleHealthCheck } from './app.controller';
import SetOptions from './utils/schema-utils';

async function Routes(fastify: FastifyInstance, options: unknown): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', SetOptions(ReportRequestHandler, 'messageIDSchema'));
}

export default Routes;
