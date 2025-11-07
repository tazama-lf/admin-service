// SPDX-License-Identifier: Apache-2.0

import type { FastifyRequest } from 'fastify';

export interface ITenantRequest extends FastifyRequest {
  tenantId: string;
}
