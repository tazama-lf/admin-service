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
import {
  createConfigHandler,
  getConfigByIdHandler,
  getAllConfigsHandler,
  updateConfigHandler,
  cloneConfigHandler,
  deleteConfigHandler,
  getActiveConfigsHandler,
  getConfigByTransactionTypeHandler,
  getConfigsByVersionHandler,
  writeConfigHandler,
  writeConfigUpdateHandler,
} from './handlers/config.handler';
import { addMappingHandler, updateMappingHandler, removeMappingHandler } from './handlers/mapping.handler';
import { addFunctionHandler, updateFunctionHandler, removeFunctionHandler } from './handlers/function.handler';
import {
  submitForApprovalHandler,
  approveConfigHandler,
  rejectConfigHandler,
  requestChangesHandler,
  deployConfigHandler,
  returnToProgressHandler,
  getWorkflowStatusHandler,
} from './handlers/workflow.handler';
import { NetworkMapRepo, RuleConfigRepo, TypologyConfigRepo } from './repositories';
import {
  AccountConditionSchema,
  EntityConditionSchema,
  ExpireAccountConditionSchema,
  ExpireDateTimeSchema,
  ExpireEntityConditionSchema,
  GetReportSchema,
  NetworkMapSchema,
  QueryAccountConditionSchema,
  QueryEntityConditionSchema,
  RuleSchema,
  TypologySchema,
} from './schemas';
import { buildCrudPlugin } from './utils/crud-schema';
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
  postTcsConfig: 'editor',
  getTcsConfig: 'view-profile',
  getTcsConfigs: 'view-profile',
  putTcsConfig: 'editor',
  deleteTcsConfig: 'editor',
  postTcsConfigClone: 'editor',
  getTcsPendingApprovals: 'view-profile',
  getTcsConfigByTransaction: 'view-profile',
  getTcsConfigByEndpoint: 'view-profile',
  postTcsConfigWrite: 'editor',
  putTcsConfigWrite: 'editor',
  deleteTcsConfigWrite: 'editor',
  postTcsConfigMapping: 'editor',
  putTcsConfigMapping: 'editor',
  deleteTcsConfigMapping: 'editor',
  postTcsConfigFunction: 'editor',
  putTcsConfigFunction: 'editor',
  deleteTcsConfigFunction: 'editor',
  postTcsWorkflowSubmit: 'editor',
  postTcsWorkflowApprove: 'approver',
  postTcsWorkflowReject: 'approver',
  postTcsWorkflowRequestChanges: 'approver',
  postTcsWorkflowDeploy: 'publisher',
  postTcsWorkflowReturnToProgress: 'editor',
  getTcsWorkflowStatus: 'view-profile',
};

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);
  fastify.get('/v1/admin/reports/getreportbymsgid', {
    ...SetOptionsBodyAndParams(reportRequestHandler, routePrivilege.getReport, undefined, GetReportSchema),
  });
  fastify.get('/v1/admin/event-flow-control/entity', {
    ...SetOptionsBodyAndParams(getEntityConditionHandler, routePrivilege.getEntity, undefined, QueryEntityConditionSchema),
  });
  fastify.get('/v1/admin/event-flow-control/account', {
    ...SetOptionsBodyAndParams(getAccountConditionsHandler, routePrivilege.getAccount, undefined, QueryAccountConditionSchema),
  });
  fastify.post('/v1/admin/event-flow-control/entity', {
    ...SetOptionsBodyAndParams(postConditionHandlerEntity, routePrivilege.postEntity, EntityConditionSchema),
  });
  fastify.post('/v1/admin/event-flow-control/account', {
    ...SetOptionsBodyAndParams(postConditionHandlerAccount, routePrivilege.postAccount, AccountConditionSchema),
  });
  fastify.put('/v1/admin/event-flow-control/entity', {
    ...SetOptionsBodyAndParams(
      updateEntityConditionExpiryDateHandler,
      routePrivilege.putEntity,
      ExpireDateTimeSchema,
      ExpireEntityConditionSchema,
    ),
  });
  fastify.put('/v1/admin/event-flow-control/account', {
    ...SetOptionsBodyAndParams(
      updateAccountConditionExpiryDateHandler,
      routePrivilege.putAccount,
      ExpireDateTimeSchema,
      ExpireAccountConditionSchema,
    ),
  });
  fastify.put('/v1/admin/event-flow-control/cache', { ...SetOptionsBodyAndParams(putRefreshCache, routePrivilege.putCache) });

  fastify.post('/v1/admin/tcs/config', {
    ...SetOptionsBodyAndParams(createConfigHandler, routePrivilege.postTcsConfig),
  });

  fastify.get('/v1/admin/tcs/config/pending-approvals', {
    ...SetOptionsBodyAndParams(getActiveConfigsHandler, routePrivilege.getTcsPendingApprovals),
  });

  fastify.get('/v1/admin/tcs/config/transaction/:transactionType', {
    ...SetOptionsBodyAndParams(getConfigByTransactionTypeHandler, routePrivilege.getTcsConfigByTransaction),
  });

  fastify.get('/v1/admin/tcs/config/endpoint/:endpointPath/:version', {
    ...SetOptionsBodyAndParams(getConfigsByVersionHandler, routePrivilege.getTcsConfigByEndpoint),
  });

  fastify.get('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(getConfigByIdHandler, routePrivilege.getTcsConfig),
  });

  fastify.get('/v1/admin/tcs/config', {
    ...SetOptionsBodyAndParams(getAllConfigsHandler, routePrivilege.getTcsConfigs),
  });

  fastify.put('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(updateConfigHandler, routePrivilege.putTcsConfig),
  });

  fastify.post('/v1/admin/tcs/config/clone', {
    ...SetOptionsBodyAndParams(cloneConfigHandler, routePrivilege.postTcsConfigClone),
  });

  fastify.delete('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(deleteConfigHandler, routePrivilege.deleteTcsConfig),
  });

  fastify.post('/v1/admin/tcs/config/write', {
    ...SetOptionsBodyAndParams(writeConfigHandler, routePrivilege.postTcsConfigWrite),
  });

  fastify.put('/v1/admin/tcs/config/:id/write', {
    ...SetOptionsBodyAndParams(writeConfigUpdateHandler, routePrivilege.putTcsConfigWrite),
  });

  fastify.post('/v1/admin/tcs/config/:id/mapping', {
    ...SetOptionsBodyAndParams(addMappingHandler, routePrivilege.postTcsConfigMapping),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' },
        },
        required: ['id'],
      },
    },
  });

  fastify.put('/v1/admin/tcs/config/:id/mapping/:index', {
    ...SetOptionsBodyAndParams(updateMappingHandler, routePrivilege.putTcsConfigMapping),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          index: { type: 'number' },
        },
        required: ['id', 'index'],
      },
    },
  });

  fastify.delete('/v1/admin/tcs/config/:id/mapping/:index', {
    ...SetOptionsBodyAndParams(removeMappingHandler, routePrivilege.deleteTcsConfigMapping),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          index: { type: 'number' },
        },
        required: ['id', 'index'],
      },
    },
  });

  fastify.post('/v1/admin/tcs/config/:id/function', {
    ...SetOptionsBodyAndParams(addFunctionHandler, routePrivilege.postTcsConfigFunction),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' },
        },
        required: ['id'],
      },
    },
  });

  fastify.put('/v1/admin/tcs/config/:id/function/:index', {
    ...SetOptionsBodyAndParams(updateFunctionHandler, routePrivilege.putTcsConfigFunction),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          index: { type: 'number' },
        },
        required: ['id', 'index'],
      },
    },
  });

  fastify.delete('/v1/admin/tcs/config/:id/function/:index', {
    ...SetOptionsBodyAndParams(removeFunctionHandler, routePrivilege.deleteTcsConfigFunction),
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          index: { type: 'number' },
        },
        required: ['id', 'index'],
      },
    },
  });

  fastify.post('/v1/admin/tcs/config/:id/workflow/submit', {
    ...SetOptionsBodyAndParams(submitForApprovalHandler, routePrivilege.postTcsWorkflowSubmit),
  });

  fastify.post('/v1/admin/tcs/config/:id/workflow/approve', {
    ...SetOptionsBodyAndParams(approveConfigHandler, routePrivilege.postTcsWorkflowApprove),
  });

  fastify.post('/v1/admin/tcs/config/:id/workflow/reject', {
    ...SetOptionsBodyAndParams(rejectConfigHandler, routePrivilege.postTcsWorkflowReject),
  });

  fastify.post('/v1/admin/tcs/config/:id/workflow/request-changes', {
    ...SetOptionsBodyAndParams(requestChangesHandler, routePrivilege.postTcsWorkflowRequestChanges),
  });

  fastify.post('/v1/admin/tcs/config/:id/workflow/deploy', {
    ...SetOptionsBodyAndParams(deployConfigHandler, routePrivilege.postTcsWorkflowDeploy),
  });

  fastify.post('/v1/admin/tcs/config/:id/workflow/return-to-progress', {
    ...SetOptionsBodyAndParams(returnToProgressHandler, routePrivilege.postTcsWorkflowReturnToProgress),
  });

  fastify.get('/v1/admin/tcs/config/:id/workflow/status', {
    ...SetOptionsBodyAndParams(getWorkflowStatusHandler, routePrivilege.getTcsWorkflowStatus),
  });

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/network_map',
      repo: NetworkMapRepo,
      schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/rule',
      repo: RuleConfigRepo,
      schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/typology',
      repo: TypologyConfigRepo,
      schemas: { Entity: TypologySchema, Create: TypologySchema, Update: TypologySchema },
    }),
  );
}

export default Routes;
