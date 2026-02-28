// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import {
  createConfigHandler,
  getConfigByIdHandler,
  getAllConfigsHandler,
  updatePublishingStatusHandler,
  writeConfigUpdateHandler,
  createTransactionTypeTableHandler,
  createTazamaDataModelTableHandler,
  updateConfigByStatusHandler,
  addMappingHandler,
  removeMappingHandler,
  addFunctionHandler,
  removeFunctionHandler,
  getAllCollectionsHandler,
  getCollectionFieldsHandler,
  createDestinationTypeHandler,
  destinationTypeExistsHandler,
  addFieldToDestinationTypeHandler,
  getAccountConditionsHandler,
  getEntityConditionHandler,
  handleHealthCheck,
  postConditionHandlerAccount,
  postConditionHandlerEntity,
  putRefreshCache,
  reportRequestHandler,
  updateAccountConditionExpiryDateHandler,
  updateEntityConditionExpiryDateHandler,
  getNodeHandler,
  createNodeHandler,
  deleteNodeByIdHandler,
  executeQueryNode,
  createRuleFlowHandler,
  updateRuleFlowHandler,
  getAllRulesHandler,
  getRulesByIdHandler,
  createRuleHandler,
  getRuleIdsHandler,
  getRuleConfigurationHandler,
  getRuleFlowHandler,
  updateRuleHandler,
  getTxTpVersionsByTransactionTypeHandler,
  getGlobalVariablesHandler,
  cloneRuleHandler,
  updateRuleStatusHandler,
  getSimulationLogsHandler,
  getTransactionTypesHandler,
  getPayloadByTransactionTypeHandler,
  getConfigByTransactionTypeHandler,
  createSimulationLogsHandler,
  getRuleFlowStatusHandler,
  getDataModelJsonHandler,
  putDataModelJsonHandler,
  getActiveNetworkMapHandler,
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
  getTcsDataModelCollectionFields: 'view-profile',
  postTcsDataModelDestinationType: 'editor',
  getTcsDataModelDestinationTypeExists: 'view-profile',
  postTcsDataModelDestinationTypeField: 'editor',
  postTcsDataModelTransactionTypeTable: 'editor',
  postTcsDataModelTable: 'editor',
  getTrsRules: 'view-profile',
  postTrsRule: 'editor',
  putTrsRule: 'editor',
  getActiveNetworkMap: 'view-profile',
  getNodes: 'view-profile',
  postNodes: 'editor',
  deleteNodes: 'editor',
  postTrsRuleFlow: 'view-profile',
  executeQueryNode: 'editor',
  postSimulationLogs: 'editor',
  getSimulationLogs: 'view-profile',
  getDataModelJson: 'view-profile',
  putDataModelJson: 'editor',
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

  fastify.put('/v1/admin/tcs/tcs/config/status/:id', {
    ...SetOptionsBodyAndParams(updateConfigByStatusHandler, routePrivilege.updateJobStatus),
  });

  fastify.get('/v1/admin/config/transaction-types', {
    ...SetOptionsBodyAndParams(getTransactionTypesHandler, routePrivilege.getTcsConfigs),
  });

  fastify.get('/v1/admin/config/payload/:transactionType/:transactionVersion', {
    ...SetOptionsBodyAndParams(getPayloadByTransactionTypeHandler, routePrivilege.getTcsConfig),
  });

  fastify.get('/v1/admin/config/:transactionType/:transactionVersion', {
    ...SetOptionsBodyAndParams(getConfigByTransactionTypeHandler, routePrivilege.getTcsConfig),
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

  fastify.get('/v1/admin/tcs/data-model/collections/:collectionId/fields/:tenantId', {
    ...SetOptionsBodyAndParams(getCollectionFieldsHandler, routePrivilege.getTcsDataModelCollectionFields),
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

  // ==================== DATA MODEL JSON OPERATIONS ====================

  fastify.get('/v1/admin/tcs/data-model/json/:tenantId', {
    ...SetOptionsBodyAndParams(getDataModelJsonHandler, routePrivilege.getDataModelJson),
  });

  fastify.put('/v1/admin/tcs/data-model/json/:tenantId', {
    ...SetOptionsBodyAndParams(putDataModelJsonHandler, routePrivilege.putDataModelJson),
  });

  // ====================  RULES OPERATIONS ====================

  // route for cloning a rule
  fastify.post('/v1/admin/trs/rule/clone/:ruleId', {
    ...SetOptionsBodyAndParams(cloneRuleHandler, routePrivilege.postTrsRule),
  });

  // route for updating status of a rule
  fastify.put('/v1/admin/trs/rule/updateStatus/:ruleId', {
    ...SetOptionsBodyAndParams(updateRuleStatusHandler, routePrivilege.putTrsRule),
  });

  fastify.get('/v1/admin/config/versions/:transactionType', {
    ...SetOptionsBodyAndParams(getTxTpVersionsByTransactionTypeHandler, routePrivilege.getTcsConfigByTransaction),
  });

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
  fastify.post('/v1/admin/trs/rule-flow/:id', {
    ...SetOptionsBodyAndParams(createRuleFlowHandler, routePrivilege.postTrsRuleFlow),
  });

  fastify.get('/v1/admin/trs/rule-flow/:ruleId', {
    ...SetOptionsBodyAndParams(getRuleFlowHandler, routePrivilege.getTrsRules),
  });

  fastify.get('/v1/admin/trs/rule-flow/status/:ruleId', {
    ...SetOptionsBodyAndParams(getRuleFlowStatusHandler, routePrivilege.getTrsRules),
  });

  fastify.put('/v1/admin/trs/rule-flow/:id', {
    ...SetOptionsBodyAndParams(updateRuleFlowHandler, routePrivilege.putTrsRule),
  });

  fastify.get('/v1/admin/trs/global-variables/:ruleId/:tenantId', {
    ...SetOptionsBodyAndParams(getGlobalVariablesHandler, routePrivilege.getTrsRules),
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

  // admin-service way for tcs
  fastify.post('/v1/admin/tcs/config/write', {
    ...SetOptionsBodyAndParams(createConfigHandler, routePrivilege.postTcsConfig),
  });
  fastify.get('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(getConfigByIdHandler, routePrivilege.getTcsConfig),
  });
  fastify.post('/v1/admin/tcs/config/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllConfigsHandler, routePrivilege.getTcsConfigs),
  });

  //nodes
  fastify.get('/v1/admin/nodes', {
    ...SetOptionsBodyAndParams(getNodeHandler, routePrivilege.getNodes),
  });

  fastify.post('/v1/admin/nodes/create', {
    ...SetOptionsBodyAndParams(createNodeHandler, routePrivilege.postNodes),
  });

  fastify.delete('/v1/admin/nodes/:nodeId', {
    ...SetOptionsBodyAndParams(deleteNodeByIdHandler, routePrivilege.deleteNodes),
  });

  fastify.post('/v1/admin/nodes/query', {
    ...SetOptionsBodyAndParams(executeQueryNode, routePrivilege.executeQueryNode),
  });
  fastify.post('/v1/admin/simulation-logs/insert', {
    ...SetOptionsBodyAndParams(createSimulationLogsHandler, routePrivilege.postSimulationLogs),
  });
  fastify.get('/v1/admin/simulation-logs/:ruleId', {
    ...SetOptionsBodyAndParams(getSimulationLogsHandler, routePrivilege.getSimulationLogs),
  });
}

export default Routes;
