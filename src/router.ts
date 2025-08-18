// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import {
  executeQueryStatementHandlerDelete,
  executeQueryStatementHandlerGet,
  executeQueryStatementHandlerPost,
  executeQueryStatementHandlerPut,
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

const routePrivilege = {
  getAccount: 'GET_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  getEntity: 'GET_V1_EVENT_FLOW_CONTROL_ENTITY',
  putAccount: 'PUT_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  putEntity: 'PUT_V1_EVENT_FLOW_CONTROL_ENTITY',
  postAccount: 'POST_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  postEntity: 'POST_V1_EVENT_FLOW_CONTROL_ENTITY',
  putCache: 'PUT_V1_EVENT_FLOW_CONTROL_CACHE',
  getReport: 'GET_V1_GETREPORTBYMSGID',
  executeDatabase: 'PUT_V1_ADMIN_DATABASE_EXECUTE',
};

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get(
    '/v1/admin/reports/getreportbymsgid',
    SetOptionsBodyAndParams(reportRequestHandler, routePrivilege.getReport, undefined, 'messageIDSchema'),
  );
  fastify.get(
    '/v1/admin/event-flow-control/entity',
    SetOptionsBodyAndParams(getEntityConditionHandler, routePrivilege.getEntity, undefined, 'queryEntityConditionSchema'),
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
  fastify.post('/v1/admin/database/execute', SetOptionsBodyAndParams(executeQueryStatementHandlerPost, routePrivilege.executeDatabase));
  fastify.put('/v1/admin/database/execute', SetOptionsBodyAndParams(executeQueryStatementHandlerPut, routePrivilege.executeDatabase));
  // fastify.get('/v1/admin/database/execute', SetOptionsBodyAndParams(executeQueryStatementHandlerGet, routePrivilege.executeDatabase));
  fastify.get(
    '/v1/admin/database/execute',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            dbname: { type: 'string' },
            object: { type: 'string' },
            field: { type: 'string' },
            value: { type: 'string' },
            // limit: { type: 'integer', default: 10 }
          },
        },
      },
    },
    executeQueryStatementHandlerGet,
  );
  fastify.delete('/v1/admin/database/execute', SetOptionsBodyAndParams(executeQueryStatementHandlerDelete, routePrivilege.executeDatabase));
}

export default Routes;
