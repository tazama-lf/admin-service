// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// RED tests (#434): buildCrudPlugin must expose two new POST actions for the
// network_map entity (which uses idParam kind 'cfg'):
//   POST <prefix>/:cfg/activate    -> 200 activated map | 404 if missing
//   POST <prefix>/:cfg/deactivate  -> 200 deactivated map | 404 if missing
// The activate route delegates to repo.activate (atomic swap) and the deactivate
// route to repo.deactivate; a null result from either maps to 404.

const mockActivate = jest.fn();
const mockDeactivate = jest.fn();
const mockPublishServiceChannel = jest.fn();

jest.mock('../../src', () => ({
  configuration: {
    AUTHENTICATED: false,
    functionName: 'admin-service',
    SERVICE_CHANNEL_SOURCE_URI_PREFIX: '',
    SERVICE_CHANNEL_PRODUCER: 'service-channel',
  },
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  serviceChannelProducer: {
    publishServiceChannel: (...args: unknown[]) => mockPublishServiceChannel(...args),
  },
  isServiceChannelConnected: () => true,
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    activate: (...args: unknown[]) => mockActivate(...args),
    deactivate: (...args: unknown[]) => mockDeactivate(...args),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';
import { NetworkMapSchema } from '../../src/schemas/networkMapSchema';

const makeMap = (cfg: string, active: boolean): NetworkMap =>
  ({
    active,
    cfg,
    tenantId: 'DEFAULT',
    creDtTm: '2024-01-01T00:00:00.000Z',
    updDtTm: '2024-06-01T12:00:00.000Z',
    messages: [],
  }) as unknown as NetworkMap;

describe('POST /v1/admin/configuration/network_map/:cfg/(de)activate (#434)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    const ajv = new Ajv({ removeAdditional: 'all', useDefaults: true, coerceTypes: 'array', strictTuples: false });
    addFormats(ajv);
    app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

    await app.register(
      buildCrudPlugin({
        prefix: '/v1/admin/configuration/network_map',
        repo: NetworkMapRepo,
        schemas: { Entity: NetworkMapSchema, Create: NetworkMapSchema, Update: NetworkMapSchema },
        idParam: { kind: 'cfg' },
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockActivate.mockReset();
    mockDeactivate.mockReset();
    mockPublishServiceChannel.mockReset();
  });

  describe('activate', () => {
    it('returns 200 with the activated map for an existing cfg', async () => {
      const activated = makeMap('2.0.0', true);
      mockActivate.mockResolvedValue(activated);

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: { cfg: '2.0.0', active: true },
        reloadDispatched: { status: true, outcome: 'published' },
      });
      expect(mockActivate).toHaveBeenCalledWith(expect.objectContaining({ cfg: '2.0.0' }));
    });

    it('returns 404 (delegating to repo.activate) when the target cfg does not exist', async () => {
      mockActivate.mockResolvedValue(null);

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/missing/activate' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('message');
      // The route must exist and delegate; a plain unregistered-route 404 would not call the repo.
      expect(mockActivate).toHaveBeenCalledWith(expect.objectContaining({ cfg: 'missing' }));
    });
  });

  describe('deactivate', () => {
    it('returns 200 with the deactivated map for an existing cfg', async () => {
      const deactivated = makeMap('1.0.0', false);
      mockDeactivate.mockResolvedValue(deactivated);

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/1.0.0/deactivate' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ cfg: '1.0.0', active: false });
      expect(mockDeactivate).toHaveBeenCalledWith(expect.objectContaining({ cfg: '1.0.0' }));
    });

    it('returns 404 (delegating to repo.deactivate) when the target cfg does not exist', async () => {
      mockDeactivate.mockResolvedValue(null);

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/missing/deactivate' });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toHaveProperty('message');
      // The route must exist and delegate; a plain unregistered-route 404 would not call the repo.
      expect(mockDeactivate).toHaveBeenCalledWith(expect.objectContaining({ cfg: 'missing' }));
    });
  });
});
