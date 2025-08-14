// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import {
  getAccountConditionsHandler,
  getEntityConditionHandler,
  handleHealthCheck,
  postConditionHandlerAccount,
  postConditionHandlerEntity,
  putRefreshCache,
  reportRequestHandler,
  updateAccountConditionExpiryDateHandler,
  updateEntityConditionExpiryDateHandler,
} from './app.controller';
import { SetOptionsBodyAndParams } from './utils/schema-utils';

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', SetOptionsBodyAndParams(reportRequestHandler, undefined, 'messageIDSchema'));
  fastify.get(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(getEntityConditionHandler, undefined, 'queryEntityConditionSchema'),
  );
  fastify.get(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(getAccountConditionsHandler, undefined, 'queryAccountConditionSchema'),
  );
  fastify.post('/v1/admin/event-flow-control/entity', SetOptionsBodyAndParams(postConditionHandlerEntity, 'entityConditionSchema'));
  fastify.post('/v1/admin/event-flow-control/account', SetOptionsBodyAndParams(postConditionHandlerAccount, 'accountConditionSchema'));
  fastify.put(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(updateEntityConditionExpiryDateHandler, 'expireDateTimeSchema', 'expireEntityConditionSchema'),
  );
  fastify.put(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(updateAccountConditionExpiryDateHandler, 'expireDateTimeSchema', 'expireAccountConditionSchema'),
  );
  fastify.put('/v1/admin/event-flow-control/cache', SetOptionsBodyAndParams(putRefreshCache));
}

export default Routes;
