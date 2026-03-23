import type { FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  tenantId?: string;
  clientId?: string;
  sub?: string;
  preferred_username?: string;
  claims?: string[];
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: AuthenticatedUser;
}
