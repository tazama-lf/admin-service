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
import {
  createConfigHandler,
  getConfigByIdHandler,
  getAllConfigsHandler,
  updateConfigHandler,
  updatePublishingStatusHandler,
  createTransactionTypeTableHandler,
  createTazamaDataModelTableHandler,
  updateConfigByStatusHandler,
  writeConfigHandler,
  writeConfigUpdateHandler,
  getTransactionTypesHandler,
  getPayloadByTransactionTypeHandler,
  getConfigByTransactionTypeHandler,
} from './handlers/config.handler';
import {
  getAllRulesHandler,
  getRulesByIdHandler,
  createRuleHandler,
  getRuleIdsHandler,
  getRuleConfigurationHandler,
  updateRuleHandler,
} from './handlers/rules.handler';
import { getActiveNetworkMapHandler } from './handlers/network-map.handler';
import { addMappingHandler, removeMappingHandler } from './handlers/mapping.handler';
import { addFunctionHandler, removeFunctionHandler } from './handlers/function.handler';
import { SetOptionsBodyAndParams } from './utils/schema-utils';
import {
  createScheduleHandler,
  findScheduleByIdHandler,
  getAllScheduleHandler,
  getScheduleByStatusHandler,
  updateScheduleByStatusHandler,
  updateScheduleHandler,
} from './handlers/scheduler.handler';
import {
  createPullJobHandler,
  createPushJobHandler,
  findJobByIdHandler,
  getAllJobsHandler,
  getAllJobsHistoryHandler,
  getJobsByStatusHandler,
  updateJobActivationHandler,
  updateJobByStatusHandler,
  updateJobHandler,
  validateTableHandler,
} from './handlers/job.handler';
import {
  getAllCollectionsHandler,
  createDestinationTypeHandler,
  destinationTypeExistsHandler,
  addFieldToDestinationTypeHandler,
} from './handlers/data-model.handler';

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
  patchTcsConfigPublishingStatus: 'publisher',
  deleteTcsConfig: 'editor',
  getTcsConfigByTransaction: 'view-profile',
  getTcsConfigByEndpoint: 'view-profile',
  postTcsConfigWrite: 'editor',
  putTcsConfigWrite: 'editor',
  deleteTcsConfigWrite: 'editor',
  postTcsRawQuery: 'publisher',
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
  postTcsWorkflowExport: 'exporter',
  postTcsWorkflowReturnToProgress: 'editor',
  getTcsWorkflowStatus: 'view-profile',
  createSchedule: 'view-profile',
  findSchedule: 'view-profile',
  updateSchedule: 'view-profile',
  getSchedules: 'view-profile',
  getAllSchedules: 'view-profile',
  updateScheduleStatus: 'view-profile',
  createPushJob: 'view-profile',
  createPullJob: 'view-profile',
  getAllJobs: 'view-profile',
  getAllJobsHistory: 'view-profile',
  getJobById: 'view-profile',
  getJobByStatus: 'view-profile',
  updateJobActivation: 'publisher',
  updateJobStatus: 'view-profile',
  updateJob: 'editor',
  validateTable: 'view-profile',
  getTcsDataModelCollections: 'view-profile',
  postTcsDataModelDestinationType: 'editor',
  getTcsDataModelDestinationTypeExists: 'view-profile',
  postTcsDataModelDestinationTypeField: 'editor',
  postTcsDataModelTransactionTypeTable: 'editor',
  postTcsDataModelTable: 'editor',
  getTrsRules: 'view-profile',
  postTrsRule: 'editor',
  putTrsRule: 'editor',
  getActiveNetworkMap: 'view-profile',
};

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);

  // ==================== Job OPERATIONS ====================

  fastify.post('/v1/admin/tcs/push/create', {
    ...SetOptionsBodyAndParams(createPushJobHandler, routePrivilege.createPushJob),
  });

  fastify.post('/v1/admin/tcs/pull/create', {
    ...SetOptionsBodyAndParams(createPullJobHandler, routePrivilege.createPullJob),
  });

  fastify.post('/v1/admin/tcs/job/get/all', {
    ...SetOptionsBodyAndParams(getAllJobsHandler, routePrivilege.getAllJobs),
  });

  fastify.post('/v1/admin/tcs/job/get/history', {
    ...SetOptionsBodyAndParams(getAllJobsHistoryHandler, routePrivilege.getAllJobsHistory),
  });

  fastify.get('/v1/admin/tcs/job/get/:id', {
    ...SetOptionsBodyAndParams(findJobByIdHandler, routePrivilege.getJobById),
  });
  fastify.get('/v1/admin/tcs/job/get/status', {
    ...SetOptionsBodyAndParams(getJobsByStatusHandler, routePrivilege.getJobByStatus),
  });

  fastify.put('/v1/admin/tcs/job/update/activation/:id', {
    ...SetOptionsBodyAndParams(updateJobActivationHandler, routePrivilege.updateJobActivation),
  });

  fastify.put('/v1/admin/tcs/job/update/status/:id', {
    ...SetOptionsBodyAndParams(updateJobByStatusHandler, routePrivilege.updateJobStatus),
  });

  fastify.put('/v1/admin/tcs/job/update/:id', {
    ...SetOptionsBodyAndParams(updateJobHandler, routePrivilege.updateJob),
  });

  fastify.get('/v1/admin/tcs/job/table', {
    ...SetOptionsBodyAndParams(validateTableHandler, routePrivilege.validateTable),
  });

  // ==================== SCHEDULER OPERATIONS ====================

  fastify.post('/v1/admin/tcs/schedule/create', {
    ...SetOptionsBodyAndParams(createScheduleHandler, routePrivilege.createSchedule),
  });

  fastify.get('/v1/admin/tcs/schedule/:id', {
    ...SetOptionsBodyAndParams(findScheduleByIdHandler, routePrivilege.findSchedule),
  });

  fastify.put('/v1/admin/tcs/schedule/update/:id', {
    ...SetOptionsBodyAndParams(updateScheduleHandler, routePrivilege.updateSchedule),
  });

  fastify.post('/v1/admin/tcs/schedule/get/all', {
    ...SetOptionsBodyAndParams(getAllScheduleHandler, routePrivilege.getAllSchedules),
  });

  fastify.get('/v1/admin/tcs/schedule/get/status', {
    ...SetOptionsBodyAndParams(getScheduleByStatusHandler, routePrivilege.getSchedules),
  });

  fastify.put('/v1/admin/tcs/schedule/update/status/:id', {
    ...SetOptionsBodyAndParams(updateScheduleByStatusHandler, routePrivilege.updateScheduleStatus),
  });

  // ==================== TCS OPERATIONS ====================
  fastify.post('/v1/admin/tcs/config/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllConfigsHandler, routePrivilege.getTcsConfigs),
  });
  fastify.put('/v1/admin/tcs/tcs/config/status/:id', {
    ...SetOptionsBodyAndParams(updateConfigByStatusHandler, routePrivilege.updateJobStatus),
  });
  fastify.post('/v1/admin/tcs/config', {
    ...SetOptionsBodyAndParams(createConfigHandler, routePrivilege.postTcsConfig),
  });

  fastify.get('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(getConfigByIdHandler, routePrivilege.getTcsConfig),
  });

  fastify.get('/v1/admin/config/transaction-types', {
    ...SetOptionsBodyAndParams(getTransactionTypesHandler, routePrivilege.getTcsConfigs),
  });

  fastify.get('/v1/admin/config/payload/:transactionType', {
    ...SetOptionsBodyAndParams(getPayloadByTransactionTypeHandler, routePrivilege.getTcsConfig),
  });

  fastify.get('/v1/admin/config/:transactionType', {
    ...SetOptionsBodyAndParams(getConfigByTransactionTypeHandler, routePrivilege.getTcsConfig),
  });

  fastify.put('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(updateConfigHandler, routePrivilege.putTcsConfig),
  });

  fastify.post('/v1/admin/tcs/config/write', {
    ...SetOptionsBodyAndParams(writeConfigHandler, routePrivilege.postTcsConfigWrite),
  });

  fastify.put('/v1/admin/tcs/config/:id/write', {
    ...SetOptionsBodyAndParams(writeConfigUpdateHandler, routePrivilege.putTcsConfigWrite),
  });

  fastify.patch('/v1/admin/tcs/config/:id/publishing-status', {
    ...SetOptionsBodyAndParams(updatePublishingStatusHandler, routePrivilege.patchTcsConfigPublishingStatus),
  });

  fastify.post('/v1/admin/tcs/config/:id/mapping', {
    ...SetOptionsBodyAndParams(addMappingHandler, routePrivilege.postTcsConfigMapping),
  });

  fastify.delete('/v1/admin/tcs/config/:id/mapping/:index', {
    ...SetOptionsBodyAndParams(removeMappingHandler, routePrivilege.deleteTcsConfigMapping),
  });

  fastify.post('/v1/admin/tcs/config/:id/function', {
    ...SetOptionsBodyAndParams(addFunctionHandler, routePrivilege.postTcsConfigFunction),
  });

  fastify.delete('/v1/admin/tcs/config/:id/function/:index', {
    ...SetOptionsBodyAndParams(removeFunctionHandler, routePrivilege.deleteTcsConfigFunction),
  });

  fastify.get('/v1/admin/tcs/data-model/collections/:tenantId', {
    ...SetOptionsBodyAndParams(getAllCollectionsHandler, routePrivilege.getTcsDataModelCollections),
  });

  fastify.post('/v1/admin/tcs/data-model/destination-types', {
    ...SetOptionsBodyAndParams(createDestinationTypeHandler, routePrivilege.postTcsDataModelDestinationType),
  });

  fastify.get('/v1/admin/tcs/data-model/destination-types/:destinationTypeId/exists', {
    ...SetOptionsBodyAndParams(destinationTypeExistsHandler, routePrivilege.getTcsDataModelDestinationTypeExists),
  });

  fastify.post('/v1/admin/tcs/data-model/destination-types/:destinationTypeId/fields', {
    ...SetOptionsBodyAndParams(addFieldToDestinationTypeHandler, routePrivilege.postTcsDataModelDestinationTypeField),
  });

  fastify.post('/v1/admin/tcs/deploy/transaction-type-table', {
    ...SetOptionsBodyAndParams(createTransactionTypeTableHandler, routePrivilege.postTcsDataModelTransactionTypeTable),
  });

  fastify.post('/v1/admin/tcs/data-model/table', {
    ...SetOptionsBodyAndParams(createTazamaDataModelTableHandler, routePrivilege.postTcsDataModelTable),
  });
  // ====================  RULES OPERATIONS ====================
  fastify.post('/v1/admin/trs/rule', {
    ...SetOptionsBodyAndParams(createRuleHandler, routePrivilege.postTrsRule),
  });
  fastify.post('/v1/admin/trs/rules/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllRulesHandler, routePrivilege.getTrsRules),
  });
  fastify.get('/v1/admin/trs/rules/:id', {
    ...SetOptionsBodyAndParams(getRulesByIdHandler, routePrivilege.getTrsRules),
  });
  fastify.get('/v1/admin/trs/rule-ids', {
    ...SetOptionsBodyAndParams(getRuleIdsHandler, routePrivilege.getTrsRules),
  });
  fastify.get('/v1/admin/trs/rule-configuration/:ruleId', {
    ...SetOptionsBodyAndParams(getRuleConfigurationHandler, routePrivilege.getTrsRules),
  });
  fastify.put('/v1/admin/trs/rule/:ruleId', {
    ...SetOptionsBodyAndParams(updateRuleHandler, routePrivilege.putTrsRule),
  });
  fastify.get('/v1/admin/network-map/active', {
    ...SetOptionsBodyAndParams(getActiveNetworkMapHandler, routePrivilege.getActiveNetworkMap),
  });
  // ====================  ADMIN SERVICE OPERATIONS ====================

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

  //-- configuration
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
