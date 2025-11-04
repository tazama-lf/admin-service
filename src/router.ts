// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
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
  deployConfigHandler,
  exportConfigHandler,
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
import { validateTenantMiddleware } from './middleware/tenantMiddleware';
import { loggerService, configuration } from './index';

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
  postTcsWorkflowExport: 'exporter',
  postTcsWorkflowReturnToProgress: 'editor',
  getTcsWorkflowStatus: 'view-profile',
};

function Routes(fastify: FastifyInstance): void {
  fastify.get('/', handleHealthCheck);
  fastify.get('/health', handleHealthCheck);

  fastify.get('/v1/admin/cache/debug', async (req, reply) => {
    const { userEmailCache } = await import('./index.js');
    const { tenantId } = req.query as { tenantId?: string };

    if (!tenantId) {
      return await reply.code(400).send({ error: 'tenantId query parameter required' });
    }

    const users = userEmailCache.getUsersByTenant(tenantId);
    const approverEmails = userEmailCache.getEmailsByRole(tenantId, 'approver');
    const editorEmails = userEmailCache.getEmailsByRole(tenantId, 'editor');
    const stats = userEmailCache.getStats();

    return await reply.send({
      success: true,
      source: 'in-memory-cache',
      tenantId,
      totalUsers: users.length,
      approverCount: approverEmails.length,
      editorCount: editorEmails.length,
      approverEmails,
      editorEmails,
      allUsers: users.map((u: { userId: string; email: string; roles: string[]; fullName?: string; lastAccess?: Date }) => ({
        userId: u.userId,
        email: u.email,
        roles: u.roles,
        fullName: u.fullName,
        lastAccess: u.lastAccess,
      })),
      cacheStats: stats,
    });
  });

  fastify.get('/v1/admin/keycloak/debug', async (req, reply) => {
    try {
      const { keycloakService } = await import('./services/keycloak.service.js');
      const { role, group } = req.query as { role?: string; group?: string };

      if (group) {
        const users = await keycloakService.getUsersByGroup(group);
        const emails = await keycloakService.getEmailsByGroup(group);

        return await reply.send({
          success: true,
          source: 'keycloak',
          type: 'group',
          groupName: group,
          totalUsers: users.length,
          emails,
          users: users.map((u) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            enabled: u.enabled,
          })),
        });
      }

      if (!role) {
        const approvers = await keycloakService.getApprovers();
        const approverEmails = await keycloakService.getApproverEmails();

        return await reply.send({
          success: true,
          source: 'keycloak',
          type: 'role',
          role: 'approver',
          totalUsers: approvers.length,
          emails: approverEmails,
          users: approvers.map((u) => ({
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            enabled: u.enabled,
          })),
        });
      }

      const users = await keycloakService.getUsersByRole(role);
      const emails = await keycloakService.getEmailsByRole(role);

      return await reply.send({
        success: true,
        source: 'keycloak',
        type: 'role',
        role,
        totalUsers: users.length,
        emails,
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          enabled: u.enabled,
        })),
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Keycloak users';
      return await reply.code(500).send({
        success: false,
        error: errorMessage,
      });
    }
  });

  fastify.get('/v1/admin/auto-discovery/debug', async (req, reply) => {
    try {
      const { keycloakService } = await import('./services/keycloak.service.js');
      const { autoDiscoveryCache } = await import('./services/auto-discovery-cache.service.js');

      const approverGroups = await keycloakService.getApproverGroups();
      const tenantGroupMap = await keycloakService.getApproverGroupsByTenant();
      const cacheStats = autoDiscoveryCache.getStats();

      const tenantGroupMapping: Record<string, string[]> = {};
      for (const [tenantId, groups] of tenantGroupMap.entries()) {
        tenantGroupMapping[tenantId] = groups;
      }

      return await reply.send({
        success: true,
        autoDiscovery: {
          discoveredApproverGroups: approverGroups,
          tenantGroupMapping,
          totalTenants: tenantGroupMap.size,
        },
        cache: {
          stats: cacheStats,
          enabled: true,
          defaultTTL: '15 minutes',
        },
        instructions: {
          testTenant: 'Call GET /v1/admin/auto-discovery/test?tenant=YOUR_TENANT_ID to test discovery for specific tenant',
          clearCache: 'Call DELETE /v1/admin/auto-discovery/cache to clear discovery cache',
        },
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to run auto-discovery debug';
      return await reply.code(500).send({
        success: false,
        error: errorMessage,
      });
    }
  });

  fastify.get('/v1/admin/auto-discovery/test', async (req, reply) => {
    try {
      const { tenant } = req.query as { tenant?: string };

      if (!tenant) {
        return await reply.code(400).send({
          success: false,
          error: 'Query parameter "tenant" is required. Example: ?tenant=tenant-001',
        });
      }

      const { keycloakService } = await import('./services/keycloak.service.js');
      const { autoDiscoveryCache } = await import('./services/auto-discovery-cache.service.js');

      const discoveredGroup = await keycloakService.getApproverGroupForTenant(tenant);
      const cachedGroup = autoDiscoveryCache.getCachedGroup(tenant);

      let approverEmails: string[] = [];
      if (discoveredGroup) {
        approverEmails = await keycloakService.getApproverEmailsByTenantAndGroup(tenant, discoveredGroup);
      }

      return await reply.send({
        success: true,
        tenant,
        results: {
          discoveredGroup: discoveredGroup ?? 'No specific group found - will use default approver role',
          cachedGroup: cachedGroup ?? 'Not cached yet',
          approverEmails,
          approverCount: approverEmails.length,
        },
        fallback: discoveredGroup ? 'None needed' : 'Will query all users with "approver" role',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to test auto-discovery';
      return await reply.code(500).send({
        success: false,
        error: errorMessage,
      });
    }
  });

  fastify.delete('/v1/admin/auto-discovery/cache', async (req, reply) => {
    try {
      const { autoDiscoveryCache } = await import('./services/auto-discovery-cache.service.js');

      autoDiscoveryCache.clearAll();

      return await reply.send({
        success: true,
        message: 'Auto-discovery cache cleared successfully',
        note: 'Next tenant lookups will trigger fresh discovery from Keycloak',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear auto-discovery cache';
      return await reply.code(500).send({
        success: false,
        error: errorMessage,
      });
    }
  });

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
  fastify.patch('/v1/admin/tcs/config/:id/status', {
    preHandler: configuration.AUTHENTICATED
      ? [
          validateTenantMiddleware,
          async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
            const authHeader = request.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
              loggerService.error('No Bearer token in authorization header for PATCH /status');
              reply.code(401).send({ error: 'Unauthorized', message: 'No Bearer token provided' });
              return;
            }
            try {
              const [, token] = authHeader.split(' ');
              const { validateTokenAndClaims } = await import('@tazama-lf/auth-lib');
              // Check if user has either exporter or publisher claims
              const validation = validateTokenAndClaims(token, ['exporter', 'publisher']);
              if (!validation.exporter && !validation.publisher) {
                loggerService.error('Token validation failed: missing exporter or publisher claims');
                reply.code(401).send({ error: 'Unauthorized', message: 'Insufficient permissions' });
                return;
              }
              loggerService.log('PATCH /status authentication successful');
            } catch (error) {
              loggerService.error(`Token validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
              reply.code(401).send({ error: 'Unauthorized', message: 'Token validation failed' });
            }
          },
        ]
      : [validateTenantMiddleware],
    handler: writeConfigUpdateHandler,
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

  fastify.post('/v1/admin/tcs/config/:id/workflow/deploy', {
    ...SetOptionsBodyAndParams(deployConfigHandler, routePrivilege.postTcsWorkflowDeploy),
  });
  fastify.post('/v1/admin/tcs/config/:id/workflow/export', {
    ...SetOptionsBodyAndParams(exportConfigHandler, routePrivilege.postTcsWorkflowExport),
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
