// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../src', () => ({
  loggerService: { debug: jest.fn() },
  configuration: { AUTHENTICATED: false },
}));

import { SetOptionsBodyAndParams } from '../../src/utils/schema-utils';
import { RateLimitTiers } from '../../src/utils/rate-limit-tiers';

// Covers how SetOptionsBodyAndParams merges the optional rateLimit tier into config.rateLimit.
describe('SetOptionsBodyAndParams - rate-limit tier merging', () => {
  const handler = async (): Promise<string> => 'ok';

  it('omits `config` entirely when no tier is supplied (route stays unaffected by rate limiting)', () => {
    const options = SetOptionsBodyAndParams(handler, 'someClaim');
    expect(options).not.toHaveProperty('config');
  });

  it('attaches the given tier under config.rateLimit when one is supplied', () => {
    const options = SetOptionsBodyAndParams(handler, 'someClaim', undefined, undefined, undefined, RateLimitTiers.write);
    expect(options.config).toEqual({ rateLimit: RateLimitTiers.write });
  });

  it('does not disturb the existing schema/preHandler shape when a tier is added', () => {
    const withoutTier = SetOptionsBodyAndParams(handler, 'someClaim');
    const withTier = SetOptionsBodyAndParams(handler, 'someClaim', undefined, undefined, undefined, RateLimitTiers.read);
    expect(withTier.handler).toBe(withoutTier.handler);
    expect(withTier.schema).toEqual(withoutTier.schema);
    expect(withTier.preHandler).toHaveLength(withoutTier.preHandler?.length ?? 0);
  });

  it('keeps body/query/params schema args intact alongside a tier', () => {
    const bodySchema = { type: 'object' };
    const options = SetOptionsBodyAndParams(handler, 'someClaim', bodySchema as never, undefined, undefined, RateLimitTiers.expensive);
    expect(options.schema.body).toBe(bodySchema);
    expect(options.config).toEqual({ rateLimit: RateLimitTiers.expensive });
  });
});
