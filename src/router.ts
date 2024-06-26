// SPDX-License-Identifier: Apache-2.0
import { handleHealthCheck, ReportRequestHandler } from './app.controller';
import { type FastifyInstance } from 'fastify';

async function Routes(fastify: FastifyInstance, options: unknown): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', ReportRequestHandler);
}

export default Routes;
