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
  getTxTpVersionsByTransactionTypeHandler,
  getGlobalVariablesHandler,
  cloneRuleHandler,
  updateRuleStatusHandler,
  getSimulationLogsHandler,
  getSimulationMessagesHandler,
  fetchSimulationItemsHandler,
  getTransactionTypesHandler,
  getPayloadByTransactionTypeHandler,
  getConfigByTransactionTypeHandler,
  getRelatedTransactionsHandler,
  createSimulationLogsHandler,
  getRuleFlowStatusHandler,
  getDataModelJsonHandler,
  putDataModelJsonHandler,
  createCronJobHandler,
  createPullJobHandler,
  createPushJobHandler,
  findJobByIdHandler,
  getAllCronJobsHandler,
  getAllJobsHandler,
  getCronJobByIdHandler,
  getCronJobByStatusHandler,
  getJobHistoryHandler,
  getJobsByStatusHandler,
  updateCronJobHandler,
  updateCronJobStatusHandler,
  updateJobActivationHandler,
  updateJobByStatusHandler,
  updateJobHandler,
  validateExistingHandler,
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
  getAllMasksHandler,
  createMaskHandler,
  updateMaskHandler,
  getMaskByIdHandler,
  stageSimulationItemsHandler,
  fetchCountApiFlow,
  findActiveMaskConfigsHandler,
  getExcludedTypesHandler,
  reviewMaskHandler,
  updateSimulationHandler,
  createSimulationHandler,
  getSimulationSuitesCountsHandler,
  getSimulationByIdHandler,
  getSimulationsHandler,
  getSuiteGenerationsHandler,
  getGenerationContextConfigsHandler,
  addContextTxtpConfigHandler,
  updateContextTxtpConfigHandler,
  getTriggerConfigsHandler,
  addTriggerTxtpConfigHandler,
  bulkUpdateTriggerConfigsHandler,
  upsertContextMappingHandler,
  getContextMappingHandler,
  deleteContextMappingHandler,
  upsertTriggerMappingHandler,
  getTriggerMappingHandler,
  deleteTriggerMappingHandler,
  createEnrichmentTableHandler,
  getEnrichmentTablesHandler,
  bulkUpdateEnrichmentTablesHandler,
  deleteEnrichmentTableHandler,
  getGenerationSummaryHandler,
  updateWizardProgressHandler,
  deleteContextTxtpConfigHandler,
  deleteTriggerTxtpConfigHandler,
  getAllSimulationsHandler,
  createTrsSimulationHandler,
  getSimulationStatsHandler,
  getSimulationResultsHandler,
  fetchCountDlhHandler,
  getAllEvaluationsHandler,
  truncateEvaluationResultsHandler,
  saveEvaluationsInResultsTableHandler,
  saveRecordInTrsSimulationHandler,
  resumeGenerationHandler,
  getFakerSemanticDataHandler,
  getSuiteResultHandler,
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

// Privilege mapping for each route, for easier maintenance and claim management
const routePrivilege = {
  getAccount: 'GET_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  getEntity: 'GET_V1_EVENT_FLOW_CONTROL_ENTITY',
  putAccount: 'PUT_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  putEntity: 'PUT_V1_EVENT_FLOW_CONTROL_ENTITY',
  postAccount: 'POST_V1_EVENT_FLOW_CONTROL_ACCOUNT',
  postEntity: 'POST_V1_EVENT_FLOW_CONTROL_ENTITY',
  putCache: 'PUT_V1_EVENT_FLOW_CONTROL_CACHE',
  getReport: 'GET_V1_GETREPORTBYMSGID',
  postTcsConfig: 'editor',
  getTcsConfig: ['editor', 'approver', 'exporter', 'publisher', 'trs_data_engineer_editor', 'trs_data_engineer_approver'],
  getAllEvaluations: ['editor', 'approver', 'exporter', 'publisher'],
  getTcsConfigs: ['editor', 'approver', 'exporter', 'publisher', 'trs_data_engineer_editor', 'trs_data_engineer_approver'],
  getTcsConfigRelatedTransactions: ['editor', 'approver', 'exporter', 'publisher'],
  putTcsConfig: ['editor', 'approver', 'publisher'],
  patchTcsConfigPublishingStatus: ['publisher', 'approver'],
  getTcsConfigByTransaction: ['editor', 'approver', 'exporter', 'publisher', 'trs_data_engineer_editor', 'trs_data_engineer_approver'],
  putTcsConfigWrite: ['editor', 'approver', 'exporter', 'publisher'],
  postTcsConfigMapping: 'editor',
  deleteTcsConfigMapping: 'editor',
  postTcsConfigFunction: 'editor',
  deleteTcsConfigFunction: 'editor',
  createSchedule: 'editor',
  findSchedule: ['editor', 'approver', 'exporter', 'publisher'],
  updateSchedule: 'editor',
  getSchedules: ['editor', 'approver', 'exporter', 'publisher'],
  getAllSchedules: ['editor', 'approver', 'exporter', 'publisher'],
  updateScheduleStatus: ['editor', 'approver', 'exporter', 'publisher'],
  createPushJob: 'editor',
  createPullJob: 'editor',
  getAllJobs: ['editor', 'approver', 'exporter', 'publisher'],
  getAllJobsHistory: 'publisher',
  getJobById: ['editor', 'approver', 'exporter', 'publisher'],
  getJobByStatus: ['editor', 'approver', 'exporter', 'publisher'],
  updateJobActivation: ['publisher', 'approver'],
  updateJobStatus: ['editor', 'approver', 'exporter', 'publisher'],
  updateJob: 'editor',
  validateTable: ['editor', 'approver', 'exporter', 'publisher'],
  postTcsDataModelTransactionTypeTable: ['editor', 'approver', 'publisher'],
  postTcsDataModelTable: ['editor', 'approver', 'publisher'],
  getTrsRules: ['editor', 'approver', 'exporter', 'publisher'],
  postTrsRule: 'editor',
  putTrsRule: ['editor', 'aaprover', 'trs_approver'],
  getTrsMasks: ['trs_data_engineer_editor', 'trs_data_engineer_approver'],
  getExcludedTypes: 'editor',
  getActiveNetworkMap: ['editor', 'approver', 'exporter', 'publisher'],
  getNodes: ['editor', 'approver', 'exporter', 'publisher'],
  postNodes: 'editor',
  deleteNodes: 'editor',
  postTrsRuleFlow: ['editor', 'approver', 'exporter', 'publisher'],
  executeQueryNode: 'editor',
  postSimulationLogs: ['editor', 'approver'],
  getSimulationLogs: ['editor', 'approver'],
  getSimulationMessages: ['editor', 'approver', 'exporter', 'publisher'],
  fetchFromDlh: ['editor', 'approver', 'exporter', 'publisher'],
  getDataModelJson: ['editor', 'approver', 'exporter', 'publisher'],
  putDataModelJson: ['editor', 'approver', 'exporter', 'publisher'],
  createMask: 'trs_data_engineer_editor',
  updateMask: 'trs_data_engineer_editor',
  reviewMask: 'trs_data_engineer_approver',
  createSimulationSuites: ['editor', 'approver'],
  getSimulationSuites: ['editor', 'approver'],
  getSimulationSuitesCounts: ['editor', 'approver'],
  getSimulationSuiteById: ['editor', 'approver'],
  updateSimulationSuite: ['editor', 'approver'],
  getSuiteGenerations: ['editor', 'approver'],
  getGenerationContextConfigs: ['editor', 'approver'],
  addContextTxtpConfig: ['editor', 'approver'],
  updateContextTxtpConfig: ['editor', 'approver'],
  getTriggerConfigs: ['editor', 'approver'],
  addTriggerTxtpConfig: ['editor', 'approver'],
  bulkUpdateTriggerConfigs: ['editor', 'approver'],
  upsertContextMapping: ['editor', 'approver'],
  getContextMapping: ['editor', 'approver'],
  deleteContextMapping: ['editor', 'approver'],
  upsertTriggerMapping: ['editor', 'approver'],
  getTriggerMapping: ['editor', 'approver'],
  deleteTriggerMapping: ['editor', 'approver'],
  getEnrichmentTables: ['editor', 'approver'],
  createEnrichmentTable: ['editor', 'approver'],
  bulkUpdateEnrichmentTables: ['editor', 'approver'],
  deleteEnrichmentTable: ['editor', 'approver'],
  getGenerationSummary: ['editor', 'approver'],
  updateWizardProgress: ['editor', 'approver'],
  deleteContextTxtpConfig: ['editor', 'approver'],
  deleteTriggerTxtpConfig: ['editor', 'approver'],
  getSimulations: ['editor', 'approver'],
  createSimulation: ['editor', 'approver'],
  getSimulationStats: ['editor', 'approver'],
  getSimulationResults: ['editor', 'approver'],
  saveRecordInTrsSimulation: ['editor', 'approver', 'exporter', 'publisher'],
  resumeGeneration: ['editor', 'approver'],
  getFakerSemanticData: ['editor', 'approver'],
  getSuiteResult: ['editor', 'approver'],
};

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);

  //-- configuration
  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/network_map',
      repo: NetworkMapRepo,
      schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema },
      idParam: { kind: 'cfg' },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/rule',
      repo: RuleConfigRepo,
      schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema },
      idParam: { kind: 'single', name: 'id' },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/typology',
      repo: TypologyConfigRepo,
      schemas: { Entity: TypologySchema, Create: TypologySchema, Update: TypologySchema },
      idParam: { kind: 'single', name: 'id' },
    }),
  );

  // ==================== Job OPERATIONS ====================

  fastify.post('/v1/admin/tcs/push/create', {
    ...SetOptionsBodyAndParams(createPushJobHandler, routePrivilege.createPushJob),
  });

  fastify.post('/v1/admin/tcs/pull/create', {
    ...SetOptionsBodyAndParams(createPullJobHandler, routePrivilege.createPullJob),
  });

  fastify.post('/v1/admin/tcs/job/get/all/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllJobsHandler, routePrivilege.getAllJobs),
  });

  fastify.post('/v1/admin/tcs/job/get/history/:offset/:limit', {
    ...SetOptionsBodyAndParams(getJobHistoryHandler, routePrivilege.getAllJobsHistory),
  });

  fastify.get('/v1/admin/tcs/job/get/status', {
    ...SetOptionsBodyAndParams(getJobsByStatusHandler, routePrivilege.getJobByStatus),
  });

  fastify.get('/v1/admin/tcs/job/get/:id', {
    ...SetOptionsBodyAndParams(findJobByIdHandler, routePrivilege.getJobById),
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
    ...SetOptionsBodyAndParams(validateExistingHandler, routePrivilege.validateTable),
  });
  // ==================== SCHEDULER OPERATIONS ====================

  fastify.post('/v1/admin/tcs/schedule/create', {
    ...SetOptionsBodyAndParams(createCronJobHandler, routePrivilege.createSchedule),
  });

  fastify.get('/v1/admin/tcs/schedule/:id', {
    ...SetOptionsBodyAndParams(getCronJobByIdHandler, routePrivilege.findSchedule),
  });

  fastify.put('/v1/admin/tcs/schedule/update/:id', {
    ...SetOptionsBodyAndParams(updateCronJobHandler, routePrivilege.updateSchedule),
  });

  fastify.post('/v1/admin/tcs/schedule/get/all/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllCronJobsHandler, routePrivilege.getAllSchedules),
  });

  fastify.get('/v1/admin/tcs/schedule/get/status', {
    ...SetOptionsBodyAndParams(getCronJobByStatusHandler, routePrivilege.getSchedules),
  });

  fastify.put('/v1/admin/tcs/schedule/update/status/:id', {
    ...SetOptionsBodyAndParams(updateCronJobStatusHandler, routePrivilege.updateScheduleStatus),
  });

  // ==================== TCS OPERATIONS ====================

  fastify.put('/v1/admin/tcs/config/status/:id', {
    ...SetOptionsBodyAndParams(updateConfigByStatusHandler, routePrivilege.putTcsConfig),
  });
  fastify.get('/v1/admin/tcs/config/related-transactions', {
    ...SetOptionsBodyAndParams(getRelatedTransactionsHandler, routePrivilege.getTcsConfigRelatedTransactions),
  });

  fastify.get('/v1/admin/config/transaction-types', {
    ...SetOptionsBodyAndParams(getTransactionTypesHandler, routePrivilege.getTcsConfigs),
  });

  fastify.get('/v1/admin/config/payload/:transactionType/:transactionVersion', {
    ...SetOptionsBodyAndParams(getPayloadByTransactionTypeHandler, routePrivilege.getTcsConfig),
  });

  fastify.get('/v1/admin/config/:transactionType/:version', {
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

  fastify.post('/v1/admin/tcs/deploy/transaction-type-table', {
    ...SetOptionsBodyAndParams(createTransactionTypeTableHandler, routePrivilege.postTcsDataModelTransactionTypeTable),
  });

  fastify.post('/v1/admin/tcs/data-model/table', {
    ...SetOptionsBodyAndParams(createTazamaDataModelTableHandler, routePrivilege.postTcsDataModelTable),
  });
  fastify.post('/v1/admin/tcs/config/write', {
    ...SetOptionsBodyAndParams(createConfigHandler, routePrivilege.postTcsConfig),
  });
  fastify.get('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(getConfigByIdHandler, routePrivilege.getTcsConfig),
  });
  fastify.post('/v1/admin/tcs/config/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllConfigsHandler, routePrivilege.getTcsConfigs),
  });

  // ==================== DATA MODEL JSON OPERATIONS ====================

  fastify.get('/v1/admin/tcs/data-model/json', {
    ...SetOptionsBodyAndParams(getDataModelJsonHandler, routePrivilege.getDataModelJson),
  });

  fastify.put('/v1/admin/tcs/data-model/json', {
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

  // ====================  MASKING OPERATIONS ====================

  fastify.post('/v1/admin/trs/masking/all/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllMasksHandler, routePrivilege.getTrsMasks),
  });

  fastify.post('/v1/admin/trs/masking/create', {
    ...SetOptionsBodyAndParams(createMaskHandler, routePrivilege.createMask),
  });

  fastify.put('/v1/admin/trs/masking/:id', {
    ...SetOptionsBodyAndParams(updateMaskHandler, routePrivilege.updateMask),
  });

  fastify.get('/v1/admin/trs/masking/:id', {
    ...SetOptionsBodyAndParams(getMaskByIdHandler, routePrivilege.getTrsMasks),
  });

  // ====================  SIMULATION OPERATIONS ====================

  fastify.post('/v1/admin/trs/simulation/create', {
    ...SetOptionsBodyAndParams(createTrsSimulationHandler, routePrivilege.createSimulation),
  });

  fastify.get('/v1/admin/trs/simulation/all/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllSimulationsHandler, routePrivilege.getSimulations),
  });

  fastify.get('/v1/admin/trs/simulation/get_simulation_stats', {
    ...SetOptionsBodyAndParams(getSimulationStatsHandler, routePrivilege.getSimulationStats),
  });

  fastify.get('/v1/admin/trs/simulation/get_simulation_results', {
    ...SetOptionsBodyAndParams(getSimulationResultsHandler, routePrivilege.getSimulationResults),
  });

  // ====================  RULE SIMULATION OPERATIONS ====================

  fastify.get('/v1/admin/trs/excluded/types', {
    ...SetOptionsBodyAndParams(getExcludedTypesHandler, routePrivilege.getExcludedTypes),
  });

  fastify.patch('/v1/admin/trs/masking/:id/review', {
    ...SetOptionsBodyAndParams(reviewMaskHandler, routePrivilege.reviewMask),
  });

  // ====================  ADMIN SERVICE OPERATIONS ====================
  fastify.get('/v1/admin/reports/getreportbymsgid', {
    ...SetOptionsBodyAndParams(reportRequestHandler, routePrivilege.getReport, undefined, GetReportSchema),
  });
  fastify.delete('/v1/dlh/truncate-evaluations', {
    ...SetOptionsBodyAndParams(truncateEvaluationResultsHandler, routePrivilege.fetchFromDlh),
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
  fastify.get('/v1/admin/reports/evaluations', {
    ...SetOptionsBodyAndParams(getAllEvaluationsHandler, routePrivilege.getAllEvaluations),
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
  fastify.get('/v1/admin/trs/global-variables/:ruleId', {
    ...SetOptionsBodyAndParams(getGlobalVariablesHandler, routePrivilege.getTrsRules),
  });
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

  //---------------------------------------- Simulation Studio ---------------------------------------------

  fastify.post('/v1/admin/trs/simulation-studio/suites', {
    ...SetOptionsBodyAndParams(createSimulationHandler, routePrivilege.createSimulationSuites),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites', {
    ...SetOptionsBodyAndParams(getSimulationsHandler, routePrivilege.getSimulationSuites),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/counts', {
    ...SetOptionsBodyAndParams(getSimulationSuitesCountsHandler, routePrivilege.getSimulationSuitesCounts),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:id', {
    ...SetOptionsBodyAndParams(getSimulationByIdHandler, routePrivilege.getSimulationSuiteById),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/suites/:id', {
    ...SetOptionsBodyAndParams(updateSimulationHandler, routePrivilege.updateSimulationSuite),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:id/generations', {
    ...SetOptionsBodyAndParams(getSuiteGenerationsHandler, routePrivilege.getSuiteGenerations),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs', {
    ...SetOptionsBodyAndParams(getGenerationContextConfigsHandler, routePrivilege.getGenerationContextConfigs),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs', {
    ...SetOptionsBodyAndParams(addContextTxtpConfigHandler, routePrivilege.addContextTxtpConfig),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs', {
    ...SetOptionsBodyAndParams(updateContextTxtpConfigHandler, routePrivilege.updateContextTxtpConfig),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs', {
    ...SetOptionsBodyAndParams(getTriggerConfigsHandler, routePrivilege.getTriggerConfigs),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs', {
    ...SetOptionsBodyAndParams(addTriggerTxtpConfigHandler, routePrivilege.addTriggerTxtpConfig),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs', {
    ...SetOptionsBodyAndParams(bulkUpdateTriggerConfigsHandler, routePrivilege.bulkUpdateTriggerConfigs),
  });

  fastify.post('/v1/admin/trs/simulation-studio/context-mappings', {
    ...SetOptionsBodyAndParams(upsertContextMappingHandler, routePrivilege.upsertContextMapping),
  });

  fastify.get('/v1/admin/trs/simulation-studio/context-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(getContextMappingHandler, routePrivilege.getContextMapping),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/context-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(deleteContextMappingHandler, routePrivilege.deleteContextMapping),
  });

  fastify.post('/v1/admin/trs/simulation-studio/trigger-mappings', {
    ...SetOptionsBodyAndParams(upsertTriggerMappingHandler, routePrivilege.upsertTriggerMapping),
  });

  fastify.get('/v1/admin/trs/simulation-studio/trigger-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(getTriggerMappingHandler, routePrivilege.getTriggerMapping),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/trigger-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(deleteTriggerMappingHandler, routePrivilege.deleteTriggerMapping),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables', {
    ...SetOptionsBodyAndParams(getEnrichmentTablesHandler, routePrivilege.getEnrichmentTables),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables', {
    ...SetOptionsBodyAndParams(createEnrichmentTableHandler, routePrivilege.createEnrichmentTable),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables', {
    ...SetOptionsBodyAndParams(bulkUpdateEnrichmentTablesHandler, routePrivilege.bulkUpdateEnrichmentTables),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables/:tableId', {
    ...SetOptionsBodyAndParams(deleteEnrichmentTableHandler, routePrivilege.deleteEnrichmentTable),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/summary', {
    ...SetOptionsBodyAndParams(getGenerationSummaryHandler, routePrivilege.getGenerationSummary),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/wizard-progress', {
    ...SetOptionsBodyAndParams(updateWizardProgressHandler, routePrivilege.updateWizardProgress),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs/:configId', {
    ...SetOptionsBodyAndParams(deleteContextTxtpConfigHandler, routePrivilege.deleteContextTxtpConfig),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs/:configId', {
    ...SetOptionsBodyAndParams(deleteTriggerTxtpConfigHandler, routePrivilege.deleteTriggerTxtpConfig),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:suiteId/generation/resume', {
    ...SetOptionsBodyAndParams(resumeGenerationHandler, routePrivilege.resumeGeneration),
  });

  fastify.get('/v1/admin/trs/simulation-studio/faker-semantic-data', {
    ...SetOptionsBodyAndParams(getFakerSemanticDataHandler, routePrivilege.getFakerSemanticData),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:suiteId/result', {
    ...SetOptionsBodyAndParams(getSuiteResultHandler, routePrivilege.getSuiteResult),
  });

  //--------------------------------- END SIMULATION STUDIO -----------------------------------------------------

  fastify.get('/v1/admin/simulation/messages', {
    ...SetOptionsBodyAndParams(getSimulationMessagesHandler, routePrivilege.getSimulationMessages),
  });
  fastify.get('/v1/admin/simulation/items', {
    ...SetOptionsBodyAndParams(fetchSimulationItemsHandler, routePrivilege.getSimulationMessages),
  });
  fastify.post('/v1/dlh/stage', {
    ...SetOptionsBodyAndParams(stageSimulationItemsHandler, routePrivilege.fetchFromDlh),
  });

  fastify.post('/v1/admin/dlh/fetch/count', {
    ...SetOptionsBodyAndParams(fetchCountDlhHandler, routePrivilege.fetchFromDlh),
  });

  fastify.get('/v1/admin/trs/masking/all-fetch', {
    ...SetOptionsBodyAndParams(fetchCountApiFlow, routePrivilege.fetchFromDlh),
  });

  fastify.post('/v1/admin/trs/masking/active-configs', {
    ...SetOptionsBodyAndParams(findActiveMaskConfigsHandler, routePrivilege.fetchFromDlh),
  });

  fastify.post('/v1/admin/trs/evaluations/save', {
    ...SetOptionsBodyAndParams(saveEvaluationsInResultsTableHandler, routePrivilege.getAllEvaluations),
  });

  fastify.post('/v1/admin/trs-simulation/save', {
    ...SetOptionsBodyAndParams(saveRecordInTrsSimulationHandler, routePrivilege.saveRecordInTrsSimulation),
  });
}

export default Routes;
