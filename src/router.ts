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
  getTransactionTypesHandler,
  getPayloadByTransactionTypeHandler,
  getConfigByTransactionTypeHandler,
  getConfigByTransactionTypeHandlerw3,
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
  updateSimulationHandler,
  createSimulationHandler,
  getSimulationSuitesCountsHandler,
  getSimulationByIdHandler,
  getSimulationsHandler,
  getSuiteGenerationsHandler,
  getLatestSuiteGenerationHandler,
  getGenerationContextConfigsHandler,
  addContextTxtpConfigHandler,
  updateContextTxtpConfigHandler,
  getTriggerConfigsHandler,
  getTriggerConfigByIdHandler,
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
  cloneGenerationHandler,
  cloneSuiteHandler,
  updateWizardProgressHandler,
  deleteContextTxtpConfigHandler,
  deleteTriggerTxtpConfigHandler,
  resumeGenerationHandler,
  updateGenerationStatusHandler,
  getFakerSemanticDataHandler,
  getSuiteResultHandler,
  saveRunResultHandler,
  generateSampleMessagesHandler,
  generateSampleTriggerMessagesHandler,
  generateSampleEnrichmentRowsHandler,
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
  NetworkMapListQuery,
  RuleListQuery,
  TypologyListQuery,
} from './schemas';
import { buildCrudPlugin } from './utils/crud-schema';
import { buildServiceChannelPlugin } from './utils/service-channel-routes';
import { SetOptionsBodyAndParams } from './utils/schema-utils';
import { withConfigurationTransaction } from './services/database.logic.service';
import { RateLimitTiers } from './utils/rate-limit-tiers';

// Shorthand for the tier applied at each SetOptionsBodyAndParams/buildCrudPlugin call site below
//   READ      - simple key/value lookups (LIST/GET on CRUD entities, config/job/schedule GETs)
//   WRITE     - mutating requests (CREATE/UPDATE/DELETE, job/schedule/config writes)
//   EXPENSIVE - multi-row generation and raw query execution (materially costlier than a write)
const { read: READ, write: WRITE, expensive: EXPENSIVE } = RateLimitTiers;

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
  getTcsConfigs: ['editor', 'approver', 'exporter', 'publisher', 'trs_data_engineer_editor', 'trs_data_engineer_approver'],
  getTcsConfigRelatedTransactions: ['editor', 'approver', 'exporter', 'publisher'],
  putTcsConfig: ['editor', 'approver', 'publisher'],
  patchTcsConfigPublishingStatus: ['publisher', 'approver'],
  getTcsConfigByTransaction: ['editor', 'approver', 'exporter', 'publisher', 'trs_data_engineer_editor', 'trs_data_engineer_approver'], // data engineer roles were given because this API is consumed on simulation sandbox as well (data scientist role uses it)
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
  putTrsRule: ['editor', 'approver', 'trs_approver'],
  getNodes: ['editor', 'approver', 'exporter', 'publisher'],
  postNodes: 'editor',
  deleteNodes: 'editor',
  postTrsRuleFlow: ['editor', 'approver', 'exporter', 'publisher'],
  executeQueryNode: 'editor',
  postSimulationLogs: ['editor', 'approver'],
  getSimulationLogs: ['editor', 'approver'],
  getDataModelJson: ['editor', 'approver', 'exporter', 'publisher'],
  putDataModelJson: ['editor', 'approver', 'exporter', 'publisher'],
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
  getTriggerConfigById: ['editor', 'approver'],
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
  cloneGeneration: ['editor', 'approver'],
  cloneSuite: ['editor', 'approver'],
  updateWizardProgress: ['editor', 'approver'],
  deleteContextTxtpConfig: ['editor', 'approver'],
  deleteTriggerTxtpConfig: ['editor', 'approver'],
  getSimulations: ['editor', 'approver'],
  resumeGeneration: ['editor', 'approver'],
  updateGenerationStatus: ['editor', 'approver'],
  getFakerSemanticData: ['editor', 'approver'],
  getSuiteResult: ['editor', 'approver'],
  saveRunResult: ['editor', 'approver'],
  generateSampleMessages: ['editor', 'approver'],
  generateSampleTriggerMessages: ['editor', 'approver'],
  generateSampleEnrichmentRows: ['editor', 'approver'],
};

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);

  //-- configuration
  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/network_map',
      repo: NetworkMapRepo,
      schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema, Query: NetworkMapListQuery },
      idParam: { kind: 'cfg' },
      rateLimit: { list: READ, get: READ, write: WRITE },
    }),
  );

  // Dedicated no-DB-write reload endpoint (POST <prefix>/reload): re-fires network-map.activated for
  // the tenant's active map with a loud, retryable 503 when the service channel is down (#447).
  fastify.register(
    buildServiceChannelPlugin({
      prefix: '/v1/admin/configuration/network_map',
      repo: NetworkMapRepo,
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/rule',
      repo: RuleConfigRepo,
      schemas: { Entity: RuleSchema, Create: RuleSchema, Update: RuleSchema, Query: RuleListQuery },
      idParam: { kind: 'single', name: 'id' },
      batch: { runInTransaction: withConfigurationTransaction },
      rateLimit: { list: READ, get: READ, write: WRITE },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/configuration/typology',
      repo: TypologyConfigRepo,
      schemas: { Entity: TypologySchema, Create: TypologySchema, Update: TypologySchema, Query: TypologyListQuery },
      idParam: { kind: 'single', name: 'id' },
      batch: { runInTransaction: withConfigurationTransaction },
      rateLimit: { list: READ, get: READ, write: WRITE },
    }),
  );

  // ==================== Job OPERATIONS ====================

  fastify.post('/v1/admin/tcs/push/create', {
    ...SetOptionsBodyAndParams(createPushJobHandler, routePrivilege.createPushJob, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/tcs/pull/create', {
    ...SetOptionsBodyAndParams(createPullJobHandler, routePrivilege.createPullJob, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/tcs/job/get/all/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllJobsHandler, routePrivilege.getAllJobs, undefined, undefined, undefined, READ),
  });

  fastify.post('/v1/admin/tcs/job/get/history/:offset/:limit', {
    ...SetOptionsBodyAndParams(getJobHistoryHandler, routePrivilege.getAllJobsHistory, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/tcs/job/get/status', {
    ...SetOptionsBodyAndParams(getJobsByStatusHandler, routePrivilege.getJobByStatus, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/tcs/job/get/:id', {
    ...SetOptionsBodyAndParams(findJobByIdHandler, routePrivilege.getJobById, undefined, undefined, undefined, READ),
  });

  fastify.put('/v1/admin/tcs/job/update/activation/:id', {
    ...SetOptionsBodyAndParams(updateJobActivationHandler, routePrivilege.updateJobActivation, undefined, undefined, undefined, WRITE),
  });

  fastify.put('/v1/admin/tcs/job/update/status/:id', {
    ...SetOptionsBodyAndParams(updateJobByStatusHandler, routePrivilege.updateJobStatus, undefined, undefined, undefined, WRITE),
  });

  fastify.put('/v1/admin/tcs/job/update/:id', {
    ...SetOptionsBodyAndParams(updateJobHandler, routePrivilege.updateJob, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/tcs/job/table', {
    ...SetOptionsBodyAndParams(validateExistingHandler, routePrivilege.validateTable, undefined, undefined, undefined, READ),
  });
  // ==================== SCHEDULER OPERATIONS ====================

  fastify.post('/v1/admin/tcs/schedule/create', {
    ...SetOptionsBodyAndParams(createCronJobHandler, routePrivilege.createSchedule, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/tcs/schedule/:id', {
    ...SetOptionsBodyAndParams(getCronJobByIdHandler, routePrivilege.findSchedule, undefined, undefined, undefined, READ),
  });

  fastify.put('/v1/admin/tcs/schedule/update/:id', {
    ...SetOptionsBodyAndParams(updateCronJobHandler, routePrivilege.updateSchedule, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/tcs/schedule/get/all/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllCronJobsHandler, routePrivilege.getAllSchedules, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/tcs/schedule/get/status', {
    ...SetOptionsBodyAndParams(getCronJobByStatusHandler, routePrivilege.getSchedules, undefined, undefined, undefined, READ),
  });

  fastify.put('/v1/admin/tcs/schedule/update/status/:id', {
    ...SetOptionsBodyAndParams(updateCronJobStatusHandler, routePrivilege.updateScheduleStatus, undefined, undefined, undefined, WRITE),
  });

  // ==================== TCS OPERATIONS ====================

  fastify.put('/v1/admin/tcs/config/status/:id', {
    ...SetOptionsBodyAndParams(updateConfigByStatusHandler, routePrivilege.putTcsConfig, undefined, undefined, undefined, WRITE),
  });
  fastify.get('/v1/admin/tcs/config/related-transactions', {
    ...SetOptionsBodyAndParams(
      getRelatedTransactionsHandler,
      routePrivilege.getTcsConfigRelatedTransactions,
      undefined,
      undefined,
      undefined,
      READ,
    ),
  });

  fastify.get('/v1/admin/config/transaction-types', {
    ...SetOptionsBodyAndParams(getTransactionTypesHandler, routePrivilege.getTcsConfigs, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/config/payload/:transactionType/:transactionVersion', {
    ...SetOptionsBodyAndParams(getPayloadByTransactionTypeHandler, routePrivilege.getTcsConfig, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/config/:transactionType/:version', {
    ...SetOptionsBodyAndParams(getConfigByTransactionTypeHandler, routePrivilege.getTcsConfig, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/config/w3/:transactionType/:version', {
    ...SetOptionsBodyAndParams(getConfigByTransactionTypeHandlerw3, routePrivilege.getTcsConfig, undefined, undefined, undefined, READ),
  });

  fastify.put('/v1/admin/tcs/config/:id/write', {
    ...SetOptionsBodyAndParams(writeConfigUpdateHandler, routePrivilege.putTcsConfigWrite, undefined, undefined, undefined, WRITE),
  });

  fastify.patch('/v1/admin/tcs/config/:id/publishing-status', {
    ...SetOptionsBodyAndParams(
      updatePublishingStatusHandler,
      routePrivilege.patchTcsConfigPublishingStatus,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.post('/v1/admin/tcs/config/:id/mapping', {
    ...SetOptionsBodyAndParams(addMappingHandler, routePrivilege.postTcsConfigMapping, undefined, undefined, undefined, WRITE),
  });

  fastify.delete('/v1/admin/tcs/config/:id/mapping/:index', {
    ...SetOptionsBodyAndParams(removeMappingHandler, routePrivilege.deleteTcsConfigMapping, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/tcs/config/:id/function', {
    ...SetOptionsBodyAndParams(addFunctionHandler, routePrivilege.postTcsConfigFunction, undefined, undefined, undefined, WRITE),
  });

  fastify.delete('/v1/admin/tcs/config/:id/function/:index', {
    ...SetOptionsBodyAndParams(removeFunctionHandler, routePrivilege.deleteTcsConfigFunction, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/tcs/deploy/transaction-type-table', {
    ...SetOptionsBodyAndParams(
      createTransactionTypeTableHandler,
      routePrivilege.postTcsDataModelTransactionTypeTable,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.post('/v1/admin/tcs/data-model/table', {
    ...SetOptionsBodyAndParams(
      createTazamaDataModelTableHandler,
      routePrivilege.postTcsDataModelTable,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });
  fastify.post('/v1/admin/tcs/config/write', {
    ...SetOptionsBodyAndParams(createConfigHandler, routePrivilege.postTcsConfig, undefined, undefined, undefined, WRITE),
  });
  fastify.get('/v1/admin/tcs/config/:id', {
    ...SetOptionsBodyAndParams(getConfigByIdHandler, routePrivilege.getTcsConfig, undefined, undefined, undefined, READ),
  });
  fastify.post('/v1/admin/tcs/config/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllConfigsHandler, routePrivilege.getTcsConfigs, undefined, undefined, undefined, READ),
  });

  // ==================== DATA MODEL JSON OPERATIONS ====================

  fastify.get('/v1/admin/tcs/data-model/json', {
    ...SetOptionsBodyAndParams(getDataModelJsonHandler, routePrivilege.getDataModelJson, undefined, undefined, undefined, READ),
  });

  fastify.put('/v1/admin/tcs/data-model/json', {
    ...SetOptionsBodyAndParams(putDataModelJsonHandler, routePrivilege.putDataModelJson, undefined, undefined, undefined, WRITE),
  });
  // ====================  RULES OPERATIONS ====================

  // route for cloning a rule
  fastify.post('/v1/admin/trs/rule/clone/:ruleId', {
    ...SetOptionsBodyAndParams(cloneRuleHandler, routePrivilege.postTrsRule, undefined, undefined, undefined, WRITE),
  });

  // route for updating status of a rule
  fastify.put('/v1/admin/trs/rule/updateStatus/:ruleId', {
    ...SetOptionsBodyAndParams(updateRuleStatusHandler, routePrivilege.putTrsRule, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/config/versions/:transactionType', {
    ...SetOptionsBodyAndParams(
      getTxTpVersionsByTransactionTypeHandler,
      routePrivilege.getTcsConfigByTransaction,
      undefined,
      undefined,
      undefined,
      READ,
    ),
  });

  fastify.post('/v1/admin/trs/rule', {
    ...SetOptionsBodyAndParams(createRuleHandler, routePrivilege.postTrsRule, undefined, undefined, undefined, WRITE),
  });
  fastify.post('/v1/admin/trs/rules/:offset/:limit', {
    ...SetOptionsBodyAndParams(getAllRulesHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });
  fastify.get('/v1/admin/trs/rules/:id', {
    ...SetOptionsBodyAndParams(getRulesByIdHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });
  fastify.get('/v1/admin/trs/rule-ids', {
    ...SetOptionsBodyAndParams(getRuleIdsHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });
  fastify.get('/v1/admin/trs/rule-configuration/:ruleId', {
    ...SetOptionsBodyAndParams(getRuleConfigurationHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });
  fastify.put('/v1/admin/trs/rule/:ruleId', {
    ...SetOptionsBodyAndParams(updateRuleHandler, routePrivilege.putTrsRule, undefined, undefined, undefined, WRITE),
  });
  fastify.post('/v1/admin/trs/rule-flow/:id', {
    ...SetOptionsBodyAndParams(createRuleFlowHandler, routePrivilege.postTrsRuleFlow, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/trs/rule-flow/:ruleId', {
    ...SetOptionsBodyAndParams(getRuleFlowHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/trs/rule-flow/status/:ruleId', {
    ...SetOptionsBodyAndParams(getRuleFlowStatusHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });

  fastify.put('/v1/admin/trs/rule-flow/:id', {
    ...SetOptionsBodyAndParams(updateRuleFlowHandler, routePrivilege.putTrsRule, undefined, undefined, undefined, WRITE),
  });

  // ====================  ADMIN SERVICE OPERATIONS ====================
  fastify.get('/v1/admin/reports/getreportbymsgid', {
    ...SetOptionsBodyAndParams(reportRequestHandler, routePrivilege.getReport, undefined, GetReportSchema, undefined, READ),
  });
  fastify.get('/v1/admin/event-flow-control/entity', {
    ...SetOptionsBodyAndParams(getEntityConditionHandler, routePrivilege.getEntity, undefined, QueryEntityConditionSchema, undefined, READ),
  });
  fastify.get('/v1/admin/event-flow-control/account', {
    ...SetOptionsBodyAndParams(
      getAccountConditionsHandler,
      routePrivilege.getAccount,
      undefined,
      QueryAccountConditionSchema,
      undefined,
      READ,
    ),
  });
  fastify.post('/v1/admin/event-flow-control/entity', {
    ...SetOptionsBodyAndParams(postConditionHandlerEntity, routePrivilege.postEntity, EntityConditionSchema, undefined, undefined, WRITE),
  });
  fastify.post('/v1/admin/event-flow-control/account', {
    ...SetOptionsBodyAndParams(
      postConditionHandlerAccount,
      routePrivilege.postAccount,
      AccountConditionSchema,
      undefined,
      undefined,
      WRITE,
    ),
  });
  fastify.put('/v1/admin/event-flow-control/entity', {
    ...SetOptionsBodyAndParams(
      updateEntityConditionExpiryDateHandler,
      routePrivilege.putEntity,
      ExpireDateTimeSchema,
      ExpireEntityConditionSchema,
      undefined,
      WRITE,
    ),
  });
  fastify.put('/v1/admin/event-flow-control/account', {
    ...SetOptionsBodyAndParams(
      updateAccountConditionExpiryDateHandler,
      routePrivilege.putAccount,
      ExpireDateTimeSchema,
      ExpireAccountConditionSchema,
      undefined,
      WRITE,
    ),
  });
  fastify.put('/v1/admin/event-flow-control/cache', {
    ...SetOptionsBodyAndParams(putRefreshCache, routePrivilege.putCache, undefined, undefined, undefined, WRITE),
  });
  fastify.get('/v1/admin/trs/global-variables/:ruleId', {
    ...SetOptionsBodyAndParams(getGlobalVariablesHandler, routePrivilege.getTrsRules, undefined, undefined, undefined, READ),
  });
  fastify.get('/v1/admin/nodes', {
    ...SetOptionsBodyAndParams(getNodeHandler, routePrivilege.getNodes, undefined, undefined, undefined, READ),
  });

  fastify.post('/v1/admin/nodes/create', {
    ...SetOptionsBodyAndParams(createNodeHandler, routePrivilege.postNodes, undefined, undefined, undefined, WRITE),
  });

  fastify.delete('/v1/admin/nodes/:nodeId', {
    ...SetOptionsBodyAndParams(deleteNodeByIdHandler, routePrivilege.deleteNodes, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/nodes/query', {
    // Raw query execution — explicitly called out as an expensive route in the issue doc.
    ...SetOptionsBodyAndParams(executeQueryNode, routePrivilege.executeQueryNode, undefined, undefined, undefined, EXPENSIVE),
  });

  fastify.post('/v1/admin/simulation-logs/insert', {
    ...SetOptionsBodyAndParams(createSimulationLogsHandler, routePrivilege.postSimulationLogs, undefined, undefined, undefined, WRITE),
  });
  fastify.get('/v1/admin/simulation-logs/:ruleId', {
    ...SetOptionsBodyAndParams(getSimulationLogsHandler, routePrivilege.getSimulationLogs, undefined, undefined, undefined, READ),
  });

  //---------------------------------------- Simulation Studio ---------------------------------------------

  fastify.post('/v1/admin/trs/simulation-studio/suites', {
    // Suite create/clone/update — explicitly called out as expensive in the issue doc.
    ...SetOptionsBodyAndParams(createSimulationHandler, routePrivilege.createSimulationSuites, undefined, undefined, undefined, EXPENSIVE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites', {
    ...SetOptionsBodyAndParams(getSimulationsHandler, routePrivilege.getSimulationSuites, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/counts', {
    ...SetOptionsBodyAndParams(
      getSimulationSuitesCountsHandler,
      routePrivilege.getSimulationSuitesCounts,
      undefined,
      undefined,
      undefined,
      READ,
    ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:id', {
    ...SetOptionsBodyAndParams(getSimulationByIdHandler, routePrivilege.getSimulationSuiteById, undefined, undefined, undefined, READ),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/suites/:id', {
    ...SetOptionsBodyAndParams(updateSimulationHandler, routePrivilege.updateSimulationSuite, undefined, undefined, undefined, EXPENSIVE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:id/generations', {
    ...SetOptionsBodyAndParams(getSuiteGenerationsHandler, routePrivilege.getSuiteGenerations, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:id/generations/latest', {
    ...SetOptionsBodyAndParams(getLatestSuiteGenerationHandler, routePrivilege.getSuiteGenerations, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs', {
    ...SetOptionsBodyAndParams(
      getGenerationContextConfigsHandler,
      routePrivilege.getGenerationContextConfigs,
      undefined,
      undefined,
      undefined,
      READ,
    ),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs', {
    ...SetOptionsBodyAndParams(addContextTxtpConfigHandler, routePrivilege.addContextTxtpConfig, undefined, undefined, undefined, WRITE),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs', {
    ...SetOptionsBodyAndParams(
      updateContextTxtpConfigHandler,
      routePrivilege.updateContextTxtpConfig,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs', {
    ...SetOptionsBodyAndParams(getTriggerConfigsHandler, routePrivilege.getTriggerConfigs, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/trigger-configs/:configId', {
    ...SetOptionsBodyAndParams(getTriggerConfigByIdHandler, routePrivilege.getTriggerConfigById, undefined, undefined, undefined, READ),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs', {
    ...SetOptionsBodyAndParams(addTriggerTxtpConfigHandler, routePrivilege.addTriggerTxtpConfig, undefined, undefined, undefined, WRITE),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs', {
    ...SetOptionsBodyAndParams(
      bulkUpdateTriggerConfigsHandler,
      routePrivilege.bulkUpdateTriggerConfigs,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.post('/v1/admin/trs/simulation-studio/context-mappings', {
    ...SetOptionsBodyAndParams(upsertContextMappingHandler, routePrivilege.upsertContextMapping, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/context-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(getContextMappingHandler, routePrivilege.getContextMapping, undefined, undefined, undefined, READ),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/context-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(deleteContextMappingHandler, routePrivilege.deleteContextMapping, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/trs/simulation-studio/trigger-mappings', {
    ...SetOptionsBodyAndParams(upsertTriggerMappingHandler, routePrivilege.upsertTriggerMapping, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/trigger-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(getTriggerMappingHandler, routePrivilege.getTriggerMapping, undefined, undefined, undefined, READ),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/trigger-mappings/:primaryTxtpId/:relatedTxtpId', {
    ...SetOptionsBodyAndParams(deleteTriggerMappingHandler, routePrivilege.deleteTriggerMapping, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables', {
    ...SetOptionsBodyAndParams(getEnrichmentTablesHandler, routePrivilege.getEnrichmentTables, undefined, undefined, undefined, READ),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables', {
    ...SetOptionsBodyAndParams(createEnrichmentTableHandler, routePrivilege.createEnrichmentTable, undefined, undefined, undefined, WRITE),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables', {
    ...SetOptionsBodyAndParams(
      bulkUpdateEnrichmentTablesHandler,
      routePrivilege.bulkUpdateEnrichmentTables,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/generations/:generationId/enrichment-tables/:tableId', {
    ...SetOptionsBodyAndParams(deleteEnrichmentTableHandler, routePrivilege.deleteEnrichmentTable, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/summary', {
    ...SetOptionsBodyAndParams(getGenerationSummaryHandler, routePrivilege.getGenerationSummary, undefined, undefined, undefined, READ),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/wizard-progress', {
    ...SetOptionsBodyAndParams(updateWizardProgressHandler, routePrivilege.updateWizardProgress, undefined, undefined, undefined, WRITE),
  });

  fastify.post('/v1/admin/trs/simulation-studio/generation/clone', {
    // Clone — explicitly called out as expensive in the issue doc.
    ...SetOptionsBodyAndParams(cloneGenerationHandler, routePrivilege.cloneGeneration, undefined, undefined, undefined, EXPENSIVE),
  });

  fastify.post('/v1/admin/trs/simulation-studio/suites/clone', {
    // Clone — explicitly called out as expensive in the issue doc.
    ...SetOptionsBodyAndParams(cloneSuiteHandler, routePrivilege.cloneSuite, undefined, undefined, undefined, EXPENSIVE),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/generations/:generationId/context-configs/:configId', {
    ...SetOptionsBodyAndParams(
      deleteContextTxtpConfigHandler,
      routePrivilege.deleteContextTxtpConfig,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.delete('/v1/admin/trs/simulation-studio/generations/:generationId/trigger-configs/:configId', {
    ...SetOptionsBodyAndParams(
      deleteTriggerTxtpConfigHandler,
      routePrivilege.deleteTriggerTxtpConfig,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:suiteId/generations/:generationId/resume', {
    // GET by HTTP verb, but resumes generation work server-side — tiered as a mutating route
    // rather than a plain lookup despite the verb.
    ...SetOptionsBodyAndParams(resumeGenerationHandler, routePrivilege.resumeGeneration, undefined, undefined, undefined, WRITE),
  });

  fastify.patch('/v1/admin/trs/simulation-studio/generations/:generationId/status', {
    ...SetOptionsBodyAndParams(
      updateGenerationStatusHandler,
      routePrivilege.updateGenerationStatus,
      undefined,
      undefined,
      undefined,
      WRITE,
    ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/faker-semantic-data', {
    ...SetOptionsBodyAndParams(getFakerSemanticDataHandler, routePrivilege.getFakerSemanticData, undefined, undefined, undefined, READ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/suites/:suiteId/result', {
    ...SetOptionsBodyAndParams(getSuiteResultHandler, routePrivilege.getSuiteResult, undefined, undefined, undefined, READ),
  });

  fastify.post('/v1/admin/trs/simulation-studio/runs/result', {
    ...SetOptionsBodyAndParams(saveRunResultHandler, routePrivilege.saveRunResult, undefined, undefined, undefined, WRITE),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/sample-messages', {
    // Sample-message generation — explicitly called out as expensive in the issue doc.
    ...SetOptionsBodyAndParams(
      generateSampleMessagesHandler,
      routePrivilege.generateSampleMessages,
      undefined,
      undefined,
      undefined,
      EXPENSIVE,
    ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/sample-trigger-messages', {
    ...SetOptionsBodyAndParams(
      generateSampleTriggerMessagesHandler,
      routePrivilege.generateSampleTriggerMessages,
      undefined,
      undefined,
      undefined,
      EXPENSIVE,
    ),
  });

  fastify.get('/v1/admin/trs/simulation-studio/generations/:generationId/sample-enrichment-rows', {
    ...SetOptionsBodyAndParams(
      generateSampleEnrichmentRowsHandler,
      routePrivilege.generateSampleEnrichmentRows,
      undefined,
      undefined,
      undefined,
      EXPENSIVE,
    ),
  });

  //--------------------------------- END SIMULATION STUDIO -----------------------------------------------------
}

export default Routes;
