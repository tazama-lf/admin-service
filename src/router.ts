// SPDX-License-Identifier: Apache-2.0
import { type FastifyInstance } from 'fastify';
import { POSTConditionHandlerEntity, POSTConditionHandlerAccount, ReportRequestHandler, handleHealthCheck } from './app.controller';
import { SetOptionsBody, SetOptionsParams } from './utils/schema-utils';

async function Routes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', SetOptionsParams(ReportRequestHandler, 'messageIDSchema'));
  fastify.post('/v1/admin/event-flow-control/entity', SetOptionsBody(POSTConditionHandlerEntity, 'entityConditionSchema'));
  fastify.post('/v1/admin/event-flow-control/account', SetOptionsBody(POSTConditionHandlerAccount, 'accountConditionSchema'));
}

export default Routes;
