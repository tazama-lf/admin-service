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
  AccountHolderRepo,
  AccountRepo,
  ConditionRepo,
  EntityRepo,
  EvaluationRepo,
  GovernedAsCreditorAccountByRepo,
  GovernedAsCreditorByRepo,
  GovernedAsDebtorAccountByRepo,
  GovernedAsDebtorByRepo,
  NetworkMapRepo,
  Pacs002Repo,
  Pacs008Repo,
  RuleConfigRepo,
  TransactionRepo,
  TypologyConfigRepo,
} from './repositories';
import {
  AccountHolderSchema,
  AccountSchema,
  ConditionSchema,
  EdgeSchema,
  EntitySchema,
  NetworkMapSchema,
  Pacs002Schema,
  Pacs008Schema,
  RuleSchema,
  TypologySchema,
  TransactionRelationshipSchema,
  ReportSchema,
} from './schemas/typebox.schemas';
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

  //-- evaluation
  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/evaluation/evaluation',
      repo: EvaluationRepo,
      schemas: { Entity: ReportSchema, Create: ReportSchema, Update: ReportSchema },
    }),
  );

  //-- raw_history
  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/raw_history/pacs002',
      repo: Pacs002Repo,
      schemas: { Entity: Pacs002Schema, Create: Pacs002Schema, Update: Pacs002Schema },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/raw_history/pacs008',
      repo: Pacs008Repo,
      schemas: { Entity: Pacs008Schema, Create: Pacs008Schema, Update: Pacs008Schema },
    }),
  );

  //-- event_history
  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/account',
      repo: AccountRepo,
      schemas: { Entity: AccountSchema, Create: AccountSchema, Update: AccountSchema },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/account_holder',
      repo: AccountHolderRepo,
      schemas: { Entity: AccountHolderSchema, Create: AccountHolderSchema, Update: AccountHolderSchema },
      idParam: { kind: 'composite', names: ['source', 'destination'] },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/entity',
      repo: EntityRepo,
      schemas: { Entity: EntitySchema, Create: EntitySchema, Update: EntitySchema },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/transaction',
      repo: TransactionRepo,
      schemas: { Entity: TransactionRelationshipSchema, Create: TransactionRelationshipSchema, Update: TransactionRelationshipSchema },
    }),
  );

  //-- event_history: event-flow
  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/condition',
      repo: ConditionRepo,
      schemas: { Entity: ConditionSchema, Create: ConditionSchema, Update: ConditionSchema },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/governed_as_creditor_account_by',
      repo: GovernedAsCreditorAccountByRepo,
      schemas: { Entity: EdgeSchema, Create: EdgeSchema, Update: EdgeSchema },
      idParam: { kind: 'composite', names: ['source', 'destination'] },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/governed_as_creditor_by',
      repo: GovernedAsCreditorByRepo,
      schemas: { Entity: EdgeSchema, Create: EdgeSchema, Update: EdgeSchema },
      idParam: { kind: 'composite', names: ['source', 'destination'] },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/governed_as_debtor_account_by',
      repo: GovernedAsDebtorAccountByRepo,
      schemas: { Entity: EdgeSchema, Create: EdgeSchema, Update: EdgeSchema },
      idParam: { kind: 'composite', names: ['source', 'destination'] },
    }),
  );

  fastify.register(
    buildCrudPlugin({
      prefix: '/v1/admin/event_history/governed_as_debtor_by',
      repo: GovernedAsDebtorByRepo,
      schemas: { Entity: EdgeSchema, Create: EdgeSchema, Update: EdgeSchema },
      idParam: { kind: 'composite', names: ['source', 'destination'] },
    }),
  );
}

export default Routes;
