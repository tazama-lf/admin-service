// SPDX-License-Identifier: Apache-2.0

import type { FastifyRequest } from 'fastify';

export interface TenantRequest extends FastifyRequest {
  tenantId: string;
}

export interface JWTPayload {
  [key: string]: string | boolean | number | undefined;
  tenantId?: string; // Tenant ID is received as a direct field in the JWT payload (not in claims)
}
