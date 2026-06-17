// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// RED tests (#444, Part C Ph1): activating a network_map must publish exactly one
// `network-map.activated` CloudEvent on the service channel AFTER the activate DB commit,
// honouring a per-request `reloadMode` body field (`none` | `broadcast`, default `broadcast`),
// and degrading (never failing the activate) when the producer is disconnected.
//
// The seam under test is the lowest-level producer primitive `publishServiceChannel(bytes, subject)`
// (Part B), reached by the activate route. The test mocks the producer + connection-state accessor
// that the bootstrap (src/index.ts) is expected to export, and asserts the route's publish behaviour
// and the augmented activate response, where entity data is nested under `data`
// and dispatch status is reported separately under `reloadDispatched`.
//
// Design decisions pinned by these tests (resolved from the #444 hand-over):
//  - `cfg`/`tenantId` are taken from the ACTIVATED ENTITY (post-commit source of truth), so a
//    non-DEFAULT tenant flows through to `subject` and `data`.
//  - admin-service passes the producer subject EXPLICITLY (Part B's startupConfig default is '' and
//    would throw), defaulting to 'service-channel' when SERVICE_CHANNEL_PRODUCER is unset.

const mockActivate = jest.fn();
const mockDeactivate = jest.fn();
const mockCreate = jest.fn();
const mockPublishServiceChannel = jest.fn();
const mockWarn = jest.fn();
let mockChannelConnected = true;

const DEFAULT_CONFIG = {
  AUTHENTICATED: false,
  // ProcessorConfig validated field used to compose the CloudEvents `source`.
  functionName: 'admin-service',
  // New service-channel config (#444): empty prefix + default producer subject.
  SERVICE_CHANNEL_SOURCE_URI_PREFIX: '' as string | undefined,
  SERVICE_CHANNEL_PRODUCER: 'service-channel' as string | undefined,
  SERVICE_CHANNEL_CONSUMER: 'service-channel-ack' as string | undefined,
};
// Mutable so individual tests can vary the prefix / producer subject; reset in beforeEach.
const mockConfiguration = { ...DEFAULT_CONFIG };

jest.mock('../../src', () => ({
  configuration: mockConfiguration,
  loggerService: {
    log: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
    debug: jest.fn(),
    warn: (...args: unknown[]) => mockWarn(...args),
  },
  // Bootstrap is expected to export the producer instance and a live connection-state accessor.
  serviceChannelProducer: {
    publishServiceChannel: (...args: unknown[]) => mockPublishServiceChannel(...args),
  },
  isServiceChannelConnected: () => mockChannelConnected,
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: (...args: unknown[]) => mockCreate(...args),
    update: jest.fn(),
    remove: jest.fn(),
    activate: (...args: unknown[]) => mockActivate(...args),
    deactivate: (...args: unknown[]) => mockDeactivate(...args),
  },
}));

import { buildCrudPlugin } from '../../src/utils/crud-schema';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';
import { NetworkMapSchema } from '../../src/schemas/networkMapSchema';

const makeMap = (cfg: string, active: boolean, tenantId = 'DEFAULT'): NetworkMap =>
  ({
    active,
    cfg,
    tenantId,
    creDtTm: '2024-01-01T00:00:00.000Z',
    updDtTm: '2024-06-01T12:00:00.000Z',
    messages: [],
  }) as unknown as NetworkMap;

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const decodePublishedEvent = (callIndex = 0): Record<string, unknown> => {
  const call = mockPublishServiceChannel.mock.calls[callIndex] as [Uint8Array, string?] | undefined;
  expect(call).toBeDefined();
  return JSON.parse(new TextDecoder().decode((call as [Uint8Array, string?])[0])) as Record<string, unknown>;
};

describe('POST /v1/admin/configuration/network_map/:cfg/activate -> publishes network-map.activated (#444)', () => {
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
    mockCreate.mockReset();
    mockPublishServiceChannel.mockReset();
    mockWarn.mockReset();
    mockChannelConnected = true;
    Object.assign(mockConfiguration, DEFAULT_CONFIG);
  });

  describe('publish exactly once on a successful activate', () => {
    it('publishes one event and reports dispatch status on a no-body (default broadcast) activate', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
      expect(response.json()).toMatchObject({
        data: { cfg: '2.0.0', active: true },
        reloadDispatched: { status: true, outcome: 'published' },
      });
    });

    it('publishes one event on an explicit reloadMode:broadcast activate', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/network_map/2.0.0/activate',
        payload: { reloadMode: 'broadcast' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
    });

    it('publishes with broadcast when a body is present but reloadMode is omitted (defensive default)', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/network_map/2.0.0/activate',
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
      expect(response.json()).toMatchObject({ reloadDispatched: { status: true, outcome: 'published' } });
    });

    it('mints a fresh unique id for each publish', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });
      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(2);
      const first = decodePublishedEvent(0);
      const second = decodePublishedEvent(1);
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('CloudEvents envelope contents (the populate contract)', () => {
    it('populates every contract field and serialises identifier-only data', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
      const event = decodePublishedEvent();
      expect(event.specversion).toBe('1.0');
      expect(event.type).toBe('org.tazama.network-map.activated');
      expect(event.source).toBe('admin-service');
      expect(event.subject).toBe('DEFAULT/2.0.0');
      expect(event.datacontenttype).toBe('application/json');
      expect(event.data).toEqual({ cfg: '2.0.0', tenantId: 'DEFAULT' });
      expect(typeof event.id).toBe('string');
      expect((event.id as string).length).toBeGreaterThan(0);
      expect(typeof event.time).toBe('string');
      expect(event.time as string).toMatch(ISO_8601);
    });

    it('derives subject and data from the activated entity (non-default tenant)', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true, 'BANK1'));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      const event = decodePublishedEvent();
      expect(event.subject).toBe('BANK1/2.0.0');
      expect(event.data).toEqual({ cfg: '2.0.0', tenantId: 'BANK1' });
    });

    it('composes source from a non-empty SERVICE_CHANNEL_SOURCE_URI_PREFIX', async () => {
      mockConfiguration.SERVICE_CHANNEL_SOURCE_URI_PREFIX = 'https://tazama.org/';
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      const event = decodePublishedEvent();
      expect(event.source).toBe('https://tazama.org/admin-service');
    });

    it('omits the compile-time-only kind and the audience extension from the wire', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      const event = decodePublishedEvent();
      expect(event).not.toHaveProperty('kind');
      expect(event).not.toHaveProperty('audience');
    });

    it('publishes to the configured producer subject (not the CloudEvents subject)', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
      const [, subject] = mockPublishServiceChannel.mock.calls[0] as [Uint8Array, string?];
      expect(subject).toBe('service-channel');
    });

    it('defaults the producer subject to service-channel when SERVICE_CHANNEL_PRODUCER is unset', async () => {
      mockConfiguration.SERVICE_CHANNEL_PRODUCER = undefined;
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
      const [, subject] = mockPublishServiceChannel.mock.calls[0] as [Uint8Array, string?];
      expect(subject).toBe('service-channel');
    });
  });

  describe('reloadMode: none suppresses the publish', () => {
    it('activates without publishing and reports suppression status', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/network_map/2.0.0/activate',
        payload: { reloadMode: 'none' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
      expect(response.json()).toMatchObject({
        data: { cfg: '2.0.0', active: true },
        reloadDispatched: { status: false, outcome: 'suppressed' },
      });
    });
  });

  describe('input validation', () => {
    it('rejects an unknown reloadMode value with 400 and does not activate or publish', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/network_map/2.0.0/activate',
        payload: { reloadMode: 'cascade' },
      });

      expect(response.statusCode).toBe(400);
      expect(mockActivate).not.toHaveBeenCalled();
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });

    it('rejects a wrong-case reloadMode value with 400 (the enum is case-sensitive)', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/network_map/2.0.0/activate',
        payload: { reloadMode: 'NONE' },
      });

      expect(response.statusCode).toBe(400);
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });
  });

  describe('degrade-not-exit when the producer is disconnected (AC#2)', () => {
    it('returns 200 with a degraded status, logs a warning, and never calls publish when the channel is down', async () => {
      mockChannelConnected = false;
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
      const body = response.json();
      expect(body).toMatchObject({
        data: { cfg: '2.0.0', active: true },
        reloadDispatched: { status: false, outcome: 'service channel unavailable' },
      });
      expect(mockWarn).toHaveBeenCalled();
    });

    it('returns 200 with a degraded status and logs a warning when publish throws at request time', async () => {
      mockActivate.mockResolvedValue(makeMap('2.0.0', true));
      mockPublishServiceChannel.mockImplementation(() => {
        throw new Error('nats publish failed');
      });

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/2.0.0/activate' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        data: { cfg: '2.0.0', active: true },
        reloadDispatched: { status: false, outcome: 'nats publish failed' },
      });
      expect(mockWarn).toHaveBeenCalled();
    });
  });

  describe('no publish on a non-activate config operation (AC: only activate publishes)', () => {
    it('does not publish when the activate target is missing (404)', async () => {
      mockActivate.mockResolvedValue(null);

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/missing/activate' });

      expect(response.statusCode).toBe(404);
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });

    it('does not publish on deactivate', async () => {
      mockDeactivate.mockResolvedValue(makeMap('1.0.0', false));

      const response = await app.inject({ method: 'POST', url: '/v1/admin/configuration/network_map/1.0.0/deactivate' });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });

    it('does not publish on create', async () => {
      mockCreate.mockResolvedValue(makeMap('3.0.0', false));

      const response = await app.inject({
        method: 'POST',
        url: '/v1/admin/configuration/network_map',
        payload: makeMap('3.0.0', false),
      });

      expect(response.statusCode).toBe(201);
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });
  });
});
