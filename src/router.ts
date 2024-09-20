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
import { SetOptionsBody, SetOptionsParams, SetOptionsBodyAndParams } from './utils/schema-utils';

const routePrivilege = {
  getAccount: 'GET_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  getEntity: 'GET_V1_EVENT_FLOW_CONTROL_ENTITY',
  putAccount: 'PUT_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  putEntity: 'PUT_V1_EVENT_FLOW_CONTROL_ENTITY',
  postAccount: 'POST_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  postEntity: 'POST_V1_EVENT_FLOW_CONTROL_ENTITY',
  putChache: 'PUT_V1_EVENT_FLOW_CONTROL_CACHE',
  getReport: 'GET_V1_GETREPORTBYMSGID',
};

async function Routes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', SetOptionsParams(reportRequestHandler, 'messageIDSchema', routePrivilege.getReport));
  fastify.get(
    '/v1/admin/event-flow-control/entity',
    SetOptionsParams(getConditionHandler, 'queryEntityConditionSchema', routePrivilege.getEntity),
  );
  fastify.get(
    '/v1/admin/event-flow-control/account',
    SetOptionsParams(getAccountConditionsHandler, 'queryAccountConditionSchema', routePrivilege.getAccount),
  );
  fastify.post('/v1/admin/event-flow-control/entity', SetOptionsBody(postConditionHandlerEntity, 'entityConditionSchema'));
  fastify.post('/v1/admin/event-flow-control/account', SetOptionsBody(postConditionHandlerAccount, 'accountConditionSchema'));
  fastify.put(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(
      updateEntityConditionExpiryDateHandler,
      'expireDateTimeSchema',
      'expireEntityConditionSchema',
      routePrivilege.putEntity,
    ),
  );
  fastify.put(
    '/v1/admin/event-flow-control/account',
    SetOptionsBodyAndParams(
      updateAccountConditionExpiryDateHandler,
      'expireDateTimeSchema',
      'expireAccountConditionSchema',
      routePrivilege.putAccount,
    ),
  );
  fastify.put('/v1/admin/event-flow-control/cache', putRefreshCache);
}

export default Routes;
