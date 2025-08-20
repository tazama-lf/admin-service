import { validateTokenAndClaims } from '@tazama-lf/auth-lib';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { configuration, loggerService } from '..';

interface JWTPayload {
  [key: string]: string | boolean | number | undefined;
  TENANT_ID?: string; // Tenant ID is received from TENANT_ID attribute in JWT token
  tenantId?: string; // Fallback for backward compatibility
}

interface TenantAwareRequest extends FastifyRequest {
  tenantId: string;
}

/**
 * Extract tenant ID from JWT token payload using TENANT_ID attribute
 * As per user story: extract tenantId from the TENANT_ID attribute in JWT token
 */
const extractTenantFromToken = (token: string): string | null => {
  try {
    // Decode JWT token payload directly (the payload is the second part after splitting by '.')
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part) from base64
    const payload = parts[1];
    const decodedPayload = Buffer.from(payload, 'base64').toString('utf8');
    const parsedPayload = JSON.parse(decodedPayload) as JWTPayload;

    // Extract tenantId from TENANT_ID attribute (primary) or tenantId field (fallback)
    let tenantId: string | undefined;

    if (parsedPayload.TENANT_ID && typeof parsedPayload.TENANT_ID === 'string') {
      tenantId = parsedPayload.TENANT_ID;
    } else if (parsedPayload.tenantId && typeof parsedPayload.tenantId === 'string') {
      tenantId = parsedPayload.tenantId;
    }

    if (tenantId) {
      const trimmedTenantId = tenantId.trim();
      if (trimmedTenantId !== '') {
        return trimmedTenantId;
      }
    }

    return null;
  } catch (error) {
    const err = error as Error;
    loggerService.error(`Failed to extract tenant from token: ${err.message}`, 'extractTenantFromToken()');
    return null;
  }
};

export const tokenHandler =
  (claim: string) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logContext = 'tokenHandler()';
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ') || !claim) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    try {
      const token = authHeader.split(' ')[1];
      const validated = validateTokenAndClaims(token, [claim]);
      if (!validated[claim]) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
      loggerService.log('Authenticated', logContext);
    } catch (error) {
      const err = error as Error;
      loggerService.error(`${err.name}: ${err.message}\n${err.stack}`, logContext);
      reply.code(401).send({ error: 'Unauthorized' });
    }
  };

/**
 * Validates both tenantId and claims from JWT token
 * @param claims Array of claims to validate (privileges, etc)
 */
export const tenantAwareTokenHandler =
  (claims: string[] = []) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logContext = 'tenantAwareTokenHandler()';
    let tenantId: string;

    if (!configuration.AUTHENTICATED) {
      tenantId = 'DEFAULT';
      loggerService.debug(`Authentication disabled, using default tenant: ${tenantId}`, logContext);
    } else {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }
      try {
        const token = authHeader.split(' ')[1];
        // Validate token and claims
        const validated = validateTokenAndClaims(token, claims);
        // Check all claims are present and true
        if (!validated || typeof validated !== 'object' || claims.some((claim) => !validated[claim])) {
          reply.code(401).send({ error: 'Unauthorized: Missing required claims' });
          return;
        }
        // Extract tenant ID from JWT payload
        const extractedTenantId = extractTenantFromToken(token);
        if (!extractedTenantId || extractedTenantId.trim() === '') {
          loggerService.error('tenantId field is missing or empty in JWT token', logContext);
          reply.code(403).send({ error: 'Forbidden: Tenant ID required' });
          return;
        }
        tenantId = extractedTenantId;
        loggerService.debug(`Authenticated with tenant: ${tenantId}`, logContext);
      } catch (error) {
        const err = error as Error;
        loggerService.error(`${err.name}: ${err.message}\n${err.stack}`, logContext);
        reply.code(403).send({ error: 'Forbidden: Tenant ID required' });
        return;
      }
    }
    // Store tenant ID in request context for use by handlers
    (request as TenantAwareRequest).tenantId = tenantId;
  };
