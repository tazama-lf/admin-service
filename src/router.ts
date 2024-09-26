// SPDX-License-Identifier: Apache-2.0
import { type FastifyInstance } from 'fastify';
import {
  getAccountConditionsHandler,
  getConditionHandler,
  handleHealthCheck,
  postConditionHandlerAccount,
  postConditionHandlerEntity,
  putRefreshCache,
  reportRequestHandler,
  updateAccountConditionExpiryDateHandler,
  updateEntityConditionExpiryDateHandler,
} from './app.controller';
import { SetOptionsBodyAndParams } from './utils/schema-utils';

const routePrivilege = {
  getAccount: 'GET_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  getEntity: 'GET_V1_EVENT_FLOW_CONTROL_ENTITY',
  putAccount: 'PUT_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  putEntity: 'PUT_V1_EVENT_FLOW_CONTROL_ENTITY',
  postAccount: 'POST_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  postEntity: 'POST_V1_EVENT_FLOW_CONTROL_ENTITY',
  putCache: 'PUT_V1_EVENT_FLOW_CONTROL_CACHE',
  getReport: 'GET_V1_GETREPORTBYMSGID',
};

async function Routes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get(
    '/v1/admin/reports/getreportbymsgid',
    SetOptionsBodyAndParams(reportRequestHandler, routePrivilege.getReport, undefined, 'messageIDSchema'),
  );
  fastify.get(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(getConditionHandler, routePrivilege.getEntity, undefined, 'queryEntityConditionSchema'),
  );
  fastify.get(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(getAccountConditionsHandler, routePrivilege.getAccount, undefined, 'queryAccountConditionSchema'),
  );
  fastify.post(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(postConditionHandlerEntity, routePrivilege.postEntity, 'entityConditionSchema'),
  );
  fastify.post(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(postConditionHandlerAccount, routePrivilege.postAccount, 'accountConditionSchema'),
  );
  fastify.put(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(
      updateEntityConditionExpiryDateHandler,
      routePrivilege.putEntity,
      'expireDateTimeSchema',
      'expireEntityConditionSchema',
    ),
  );
  fastify.put(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(
      updateAccountConditionExpiryDateHandler,
      routePrivilege.putAccount,
      'expireDateTimeSchema',
      'expireAccountConditionSchema',
    ),
  );
  fastify.put('/v1/admin/event-flow-control/cache', SetOptionsBodyAndParams(putRefreshCache, routePrivilege.putCache));
}

export default Routes;
