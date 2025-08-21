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
  fastify.get(
    '/v1/admin/reports/getreportbymsgid',
    SetOptionsBodyAndParams(reportRequestHandler, ['GET_V1_GETREPORTBYMSGID'], 'messageIDSchema'),
  );
  fastify.get(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(getEntityConditionHandler, ['GET_V1_EVENT_FLOW_CONTROL_ENTITY'], 'queryEntityConditionSchema'),
  );
  fastify.get(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(getAccountConditionsHandler, ['GET_V1_EVENT_FLOW_CONTROL_ACCOUNT'], 'queryAccountConditionSchema'),
  );
  fastify.post(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(postConditionHandlerEntity, ['POST_V1_EVENT_FLOW_CONTROL_ENTITY'], 'entityConditionSchema'),
  );
  fastify.post(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(postConditionHandlerAccount, ['POST_V1_EVENT_FLOW_CONTROL_ACCOUNT'], 'accountConditionSchema'),
  );
  fastify.put(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(
      updateEntityConditionExpiryDateHandler,
      ['PUT_V1_EVENT_FLOW_CONTROL_ENTITY'],
      'expireDateTimeSchema',
      'expireEntityConditionSchema',
    ),
  );
  fastify.put(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(
      updateAccountConditionExpiryDateHandler,
      ['PUT_V1_EVENT_FLOW_CONTROL_ACCOUNT'],
      'expireDateTimeSchema',
      'expireAccountConditionSchema',
    ),
  );
  fastify.put('/v1/admin/event-flow-control/cache', SetOptionsBodyAndParams(putRefreshCache, ['PUT_V1_EVENT_FLOW_CONTROL_CACHE']));
}

export default Routes;
