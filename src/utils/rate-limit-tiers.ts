// SPDX-License-Identifier: Apache-2.0
// Shared rate-limit tiers. Routes opt in by picking one of these instead of inventing their own
// numbers, so tuning stays in one place.
import { Type } from '@sinclair/typebox';
import type { errorResponseBuilderContext } from '@fastify/rate-limit';
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

// Body returned when a limit is exceeded. Mirrors ErrorHandler.sendError's shape
// (src/handlers/errorHandler.ts) so a 429 carries the same fields as every other error this API
// returns.
//
// Every field is optional on purpose. Fastify serializes error payloads with fast-json-stringify,
// which THROWS on a missing required property; that throw is caught by the fallback error handler,
// which re-serializes a stripped-down view of the failure and answers 500. A required list would
// therefore turn any future divergence between builder and schema into a 500 instead of the 429 the
// caller needs to see. The builder below always sends all five.
export const RateLimitErrorResponse = Type.Object(
  {
    success: Type.Optional(Type.Boolean({ description: 'Always false. Present on every error response this API returns.' })),
    error: Type.Optional(Type.String({ description: "Error identifier — 'TooManyRequests'." })),
    message: Type.Optional(Type.String({ description: 'Human-readable description, including how long to wait before retrying.' })),
    statusCode: Type.Optional(Type.Integer({ description: 'Always 429.' })),
    details: Type.Optional(Type.String({ description: 'Same text as `message`; kept for parity with the other error responses.' })),
  },
  { description: 'Returned when the caller exceeds this route’s rate limit. Retry after the delay in the Retry-After header.' },
);

// The body @fastify/rate-limit throws when a limit is exceeded. Lives here (rather than inline in
// src/clients/fastify.ts) so the shape stays next to the schema that documents it, and so tests can
// exercise the real builder instead of a copy.
export const rateLimitErrorResponseBuilder = (
  _req: FastifyRequest,
  context: errorResponseBuilderContext,
): { statusCode: number; message: string; success: boolean; error: string; details: string } => {
  const message = `Rate limit exceeded, retry in ${context.after}`;
  return {
    // statusCode must be set explicitly, or the thrown error defaults to a 500 instead of 429.
    statusCode: 429,
    message,
    // Matches ErrorHandler.sendError's shape (src/handlers/errorHandler.ts) so the 429 body carries
    // the same fields as every other error this service returns. These extra fields only survive
    // because rate-limited routes declare the 429 response schema below: with no schema for the
    // status code, Fastify's error serializer emits { error, code, message, statusCode } and drops
    // the rest.
    success: false,
    error: 'TooManyRequests',
    details: message,
  };
};

// Attached to the `response` map of every route that declares a tier, so the generated OpenAPI spec
// documents the 429 and the headers that come with it (issue §2.9). `headers` is read by
// @fastify/swagger to emit OpenAPI response headers; fast-json-stringify ignores the extra keyword
// when compiling the body serializer.
// Typed as plain JSON schema (rather than the inferred TypeBox type) so the export stays nameable:
// spreading a TObject drags in TypeBox's internal Kind symbols, which cannot be named across modules.
export const rateLimitResponses: { 429: Record<string, unknown> } = {
  429: {
    ...RateLimitErrorResponse,
    headers: {
      'retry-after': {
        type: 'integer',
        description: 'Seconds to wait before retrying. Sent on every 429 from a rate-limited route.',
      },
      'x-ratelimit-limit': { type: 'integer', description: 'Requests allowed within the current window.' },
      'x-ratelimit-remaining': { type: 'integer', description: 'Requests left in the current window (0 on a 429).' },
      'x-ratelimit-reset': { type: 'integer', description: 'Seconds until the current window resets.' },
    },
  },
};
