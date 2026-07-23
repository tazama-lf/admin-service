// SPDX-License-Identifier: Apache-2.0
import { Type } from '@sinclair/typebox';
import type { FastifyInstance, FastifyPluginAsync, RawServerDefault } from 'fastify';
import fp from 'fastify-plugin';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces/NetworkMap';
import { configuration, loggerService } from '..';
import { tokenHandler } from '../auth/authHandler';
import type { ITenantRequest } from '../interface/ITenantRequest';
import { validateTenantMiddleware } from '../middleware/tenantMiddleware';
import type { AllowedId, CrudRepository } from '../repositories/repository.base';
import { dispatchCascade } from '../services/cascade';
import { publishNetworkMapActivated } from '../services/serviceChannel';
import { ErrorResponse } from './crud-schema';

interface BuildServiceChannelOptions<TEntity, TId extends AllowedId> {
  prefix: string;
  repo: CrudRepository<TEntity, TId>;
}

// The logical event name reported back to the operator (the CloudEvents `type` on the wire is the
// fully-qualified `org.tazama.network-map.activated`; this is the short, contract-stable label).
const RELOAD_EVENT = 'network-map.activated';

// `reloadMode` is REQUIRED here and narrowed to { broadcast, cascade } - unlike the activate route,
// where it is optional (default broadcast) and also accepts `none`. A dedicated dispatch endpoint has
// no neutral "do nothing" reload, so a missing / `none` / unknown value is a 400. `none` is a near-miss
// (a legal value on activate) so it gets a tailored message distinguishing it from outright garbage.
const VALID_MODES = 'reloadMode is required and must be one of: broadcast, cascade';
const NONE_NOT_APPLICABLE =
  "reloadMode 'none' does not apply to the reload endpoint - it would dispatch nothing; use 'broadcast' or 'cascade'";

const ReloadResponse = Type.Object(
  {
    event: Type.String({ description: 'The logical event re-dispatched (network-map.activated).' }),
    dispatched: Type.Boolean({ description: 'True when the event was handed to the broker.' }),
    outcome: Type.String({ description: 'published (broadcast) or cascade initiated (cascade).' }),
  },
  { description: 'Successful re-dispatch of the tenant active map reload event.' },
);

const ReloadUnavailable = Type.Object(
  {
    error: Type.String({ description: 'Why the dispatch could not be performed.' }),
    event: Type.String(),
    dispatched: Type.Boolean({ description: 'Always false - nothing reached the broker.' }),
  },
  { description: 'Loud, retryable 503 returned when the service channel is unavailable.' },
);

// A DEDICATED service-channel reload plugin, kept apart from buildCrudPlugin because the reload is a
// no-DB-write control-plane signal: it re-fires `network-map.activated` for the tenant's CURRENTLY
// ACTIVE map and nothing else. Publishing IS the whole operation, so a broker-down dispatch fails
// LOUDLY with a retryable 503 (not a 2xx-and-flag, as the activate side-effect does). The route is only
// registered for a repo that exposes the single-active read `getActive` (network_map).
export const buildServiceChannelPlugin = <TEntity, TId extends AllowedId = { id: string; cfg: string; tenantId: string }>(
  opts: BuildServiceChannelOptions<TEntity, TId>,
): FastifyPluginAsync => {
  const plugin: FastifyPluginAsync = async (app: FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse>) => {
    const { prefix, repo } = opts;
    const getActiveFn = repo.getActive;
    if (!getActiveFn) return;

    // AUTH:EXAMPLE(POST_V1_ADMIN_CONFIGURATION_NETWORK_MAP_RELOAD)
    const privilege = `POST${prefix.replaceAll('/', '_').toUpperCase()}_RELOAD`;

    app.post(
      `${prefix}/reload`,
      {
        schema: {
          tags: ['service-channel'],
          response: { 200: ReloadResponse, 400: ErrorResponse, 404: ErrorResponse, 503: ReloadUnavailable },
        },
        preHandler: configuration.AUTHENTICATED ? [validateTenantMiddleware, tokenHandler(privilege)] : [validateTenantMiddleware],
      },
      async (req, reply) => {
        const { tenantId } = req as ITenantRequest;

        if (req.body !== undefined && (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body))) {
          return await reply.code(400).send({ message: VALID_MODES });
        }

        const { reloadMode } = (req.body ?? {}) as Record<string, unknown>;
        if (reloadMode === 'none') {
          return await reply.code(400).send({ message: NONE_NOT_APPLICABLE });
        }
        if (reloadMode !== 'broadcast' && reloadMode !== 'cascade') {
          return await reply.code(400).send({ message: VALID_MODES });
        }

        // The tenant's single active map (highlander). A null result is the existence gate: there is
        // nothing to reload, so 404 - no separate active-state guard is needed.
        const active = await getActiveFn(tenantId);
        if (!active) return await reply.code(404).send({ message: 'No active network map' });

        // cfg/tenantId are taken from the FETCHED map (the source of truth for what is active), never
        // from the request - the dispatch can therefore never point at a stale or wrong cfg.
        const map = active as unknown as NetworkMap;
        const resolvedTenant = typeof map.tenantId === 'string' ? map.tenantId : tenantId;

        const dispatched =
          reloadMode === 'cascade'
            ? dispatchCascade(map, map.cfg, resolvedTenant)
            : await publishNetworkMapActivated(map.cfg, resolvedTenant);

        // Publishing IS the whole operation (no DB write to fall back on), so a degraded dispatch is a
        // hard, retryable 503 - never a silent success.
        if (!dispatched.status) {
          loggerService.warn(`Network-map reload dispatch failed: ${dispatched.outcome}`);
          return await reply.code(503).send({ error: dispatched.outcome, event: RELOAD_EVENT, dispatched: false });
        }

        return { event: RELOAD_EVENT, dispatched: true, outcome: dispatched.outcome };
      },
    );

    await Promise.resolve(true);
  };

  return fp(plugin, { name: `service-channel:${opts.prefix}` });
};
