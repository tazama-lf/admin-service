// SPDX-License-Identifier: Apache-2.0

import type { FastifyRequest } from 'fastify';

/**
 * Interface extending FastifyRequest to include tenant information
 * The tenantId is guaranteed to be set by the tenantAwareTokenHandler middleware:
 * - When AUTHENTICATED=true: middleware validates JWT and extracts tenantId from payload (or returns 403)
 * - When AUTHENTICATED=false: middleware sets tenantId='DEFAULT'
 */
export interface TenantAwareRequest extends FastifyRequest {
  tenantId: string;
}
