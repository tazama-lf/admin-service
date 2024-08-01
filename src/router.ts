// SPDX-License-Identifier: Apache-2.0
import SetOptions from './utils/schema-utils';
import { handleHealthCheck, POSTConditionHandler, ReportRequestHandler } from './app.controller';
import { type FastifyInstance } from 'fastify';

async function Routes(fastify: FastifyInstance, options: unknown): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', SetOptions(ReportRequestHandler, 'messageIDSchema'));
  fastify.post('/v1/admin/event-flow-control/entity', POSTConditionHandler);
}

export default Routes;
