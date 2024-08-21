// SPDX-License-Identifier: Apache-2.0
import { type FastifyInstance } from 'fastify';
import {
  postConditionHandlerEntity,
  postConditionHandlerAccount,
  reportRequestHandler,
  handleHealthCheck,
  getConditionHandler,
  getAccountConditionsHandler,
} from './app.controller';
import { SetOptionsBody, SetOptionsParams } from './utils/schema-utils';

async function Routes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', SetOptionsParams(reportRequestHandler, 'messageIDSchema'));
  fastify.get('/v1/admin/event-flow-control/entity/getconditions', SetOptionsParams(getConditionHandler, 'queryEntityConditionSchema'));
  fastify.post('/v1/admin/event-flow-control/entity', SetOptionsBody(postConditionHandlerEntity, 'entityConditionSchema'));
  fastify.post('/v1/admin/event-flow-control/account', SetOptionsBody(postConditionHandlerAccount, 'accountConditionSchema'));
  fastify.get(
    '/v1/admin/event-flow-control/account/getconditions',
    SetOptionsParams(getAccountConditionsHandler, 'queryAccountConditionSchema'),
  );
}

export default Routes;
