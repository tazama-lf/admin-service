// SPDX-License-Identifier: Apache-2.0
// Shared rate-limit tiers. Routes opt in by picking one of these instead of inventing their own
// numbers, so tuning stays in one place.
import type { FastifyRequest } from 'fastify';
import type { ITenantRequest } from '../interface/ITenantRequest';

export interface RateLimitTierConfig {
  max: number;
  timeWindow: string;
}

// validateTenantMiddleware sets tenantId to this literal string when unauthenticated — never
// undefined. So `tenantId ?? req.ip` would never fall back to the IP; we have to check for the
// sentinel explicitly below.
export const UNAUTHENTICATED_TENANT_SENTINEL = 'DEFAULT';

export const rateLimitKeyGenerator = (req: FastifyRequest): string => {
  const { tenantId } = req as ITenantRequest;
  return tenantId && tenantId !== UNAUTHENTICATED_TENANT_SENTINEL ? tenantId : req.ip;
};

export const RateLimitTiers = {
  /** Simple key/value lookups: LIST/GET on CRUD entities, config/job/schedule GETs. */
  read: { max: 300, timeWindow: '1 minute' },
  /** Mutating requests: CREATE/UPDATE/DELETE on CRUD entities, job/schedule/config writes. */
  write: { max: 60, timeWindow: '1 minute' },
  /** Multi-row generation and raw query execution: materially costlier than a single write. */
  expensive: { max: 10, timeWindow: '1 minute' },
} as const satisfies Record<string, RateLimitTierConfig>;

export type RateLimitTierName = keyof typeof RateLimitTiers;
