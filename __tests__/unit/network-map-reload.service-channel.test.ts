// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces';

// RED tests (#447, Part C Ph9): a DEDICATED operator re-dispatch endpoint
//   POST /v1/admin/configuration/network_map/reload
// that re-fires `network-map.activated` for the tenant's CURRENTLY ACTIVE map. Publishing the event is
// the WHOLE operation (no DB write), so unlike the activate side-effect (2xx-and-flag) this path fails
// LOUDLY with a retryable 503 when the broker is unreachable.
//
// Contract pinned by these tests (final design, diverging from the issue's original "optional, default
// broadcast" phrasing):
//  - `reloadMode` is REQUIRED and must be one of { broadcast, cascade }. Missing body / `none` / any
//    other value -> 400 (a dedicated dispatch endpoint has no neutral "do nothing" reload).
//  - The endpoint takes NO `:cfg` param. It fetches the tenant's single active map via the new repo
//    method `getActive(tenantId)` (DB highlander: at most one active map per tenant). No active map -> 404.
//  - `cfg`/`tenantId` for the published event are DERIVED FROM THE FETCHED MAP, never from the request
//    path, so the dispatch always matches what is actually active.
//  - Broker healthy with no listener is still a success (core NATS: no PubAck, no no-responders signal).
//
// The seam under test is the producer primitive `publishServiceChannel(bytes, subject)` plus the live
// connection-state accessor `isServiceChannelConnected()` (same seam the Phase 1 / Phase 8 route tests
// use), so the real `publishNetworkMapActivated` / `dispatchCascade` run end-to-end - the test asserts
// the WIRE contract, not which helper the handler happens to call.

const mockGetActive = jest.fn();
const mockPublishServiceChannel = jest.fn();
const mockWarn = jest.fn();
let mockChannelConnected = true;

const DEFAULT_CONFIG = {
  AUTHENTICATED: false,
  functionName: 'admin-service',
  SERVICE_CHANNEL_SOURCE_URI_PREFIX: '' as string | undefined,
  SERVICE_CHANNEL_PRODUCER: 'service-channel' as string | undefined,
  SERVICE_CHANNEL_CONSUMER: 'service-channel-ack' as string | undefined,
};
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
  serviceChannelProducer: {
    publishServiceChannel: (...args: unknown[]) => mockPublishServiceChannel(...args),
  },
  isServiceChannelConnected: () => mockChannelConnected,
}));

jest.mock('../../src/repositories/configuration/network.map.repository', () => ({
  NetworkMapRepo: {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
    getActive: (...args: unknown[]) => mockGetActive(...args),
  },
}));

import { buildServiceChannelPlugin } from '../../src/utils/service-channel-routes';
import { NetworkMapRepo } from '../../src/repositories/configuration/network.map.repository';

const RELOAD_URL = '/v1/admin/configuration/network_map/reload';
const ACTIVATED_EVENT = 'network-map.activated';
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const makeMap = (cfg: string, tenantId = 'DEFAULT'): NetworkMap =>
  ({
    active: true,
    cfg,
    tenantId,
    creDtTm: '2024-01-01T00:00:00.000Z',
    updDtTm: '2024-06-01T12:00:00.000Z',
    messages: [],
  }) as unknown as NetworkMap;

const decodePublishedEvent = (callIndex = 0): Record<string, unknown> => {
  const call = mockPublishServiceChannel.mock.calls[callIndex] as [Uint8Array, string?] | undefined;
  expect(call).toBeDefined();
  return JSON.parse(new TextDecoder().decode((call as [Uint8Array, string?])[0])) as Record<string, unknown>;
};

const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('POST /v1/admin/configuration/network_map/reload (#447 - dedicated reload, loud 503)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    const ajv = new Ajv({ removeAdditional: 'all', useDefaults: true, coerceTypes: 'array', strictTuples: false });
    addFormats(ajv);
    app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

    await app.register(
      buildServiceChannelPlugin({
        prefix: '/v1/admin/configuration/network_map',
        repo: NetworkMapRepo,
      }),
    );

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockGetActive.mockReset();
    mockPublishServiceChannel.mockReset();
    mockWarn.mockReset();
    mockChannelConnected = true;
    Object.assign(mockConfiguration, DEFAULT_CONFIG);
  });

  describe('reloadMode is required and narrowed to { broadcast, cascade } -> 400', () => {
    it('rejects a request with no body and neither fetches nor publishes', async () => {
      const response = await app.inject({ method: 'POST', url: RELOAD_URL });

      expect(response.statusCode).toBe(400);
      // The generic invalid-value message names the only valid options.
      expect(response.json().message).toMatch(/broadcast/);
      expect(response.json().message).toMatch(/cascade/);
      expect(mockGetActive).not.toHaveBeenCalled();
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });

    it('rejects reloadMode: none with a none-aware message (no neutral reload on a dedicated dispatch endpoint)', async () => {
      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'none' } });

      expect(response.statusCode).toBe(400);
      // `none` is a near-miss (a legal reloadMode on activate), so it gets a tailored message that
      // explains why it does not apply here - distinct from the generic invalid-value message.
      expect(response.json().message).toMatch(/none/i);
      expect(mockGetActive).not.toHaveBeenCalled();
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });

    it('rejects an unknown reloadMode value', async () => {
      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'bogus' } });

      expect(response.statusCode).toBe(400);
      expect(response.json().message).toMatch(/broadcast/);
      expect(response.json().message).toMatch(/cascade/);
      expect(mockGetActive).not.toHaveBeenCalled();
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });
  });

  describe('no active map for the tenant -> 404 (the active=true query is the gate)', () => {
    it('returns 404 with a descriptive message and never publishes', async () => {
      mockGetActive.mockResolvedValue(null);

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'broadcast' } });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ message: 'No active network map' });
      // The route must exist and delegate to getActive scoped by the request tenant.
      expect(mockGetActive).toHaveBeenCalledWith('DEFAULT');
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });
  });

  describe('reloadMode: broadcast re-fires the active map -> 200', () => {
    it('publishes exactly one event and reports dispatched: true / published', async () => {
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'broadcast' } });

      expect(response.statusCode).toBe(200);
      expect(mockPublishServiceChannel).toHaveBeenCalledTimes(1);
      expect(response.json()).toMatchObject({ event: ACTIVATED_EVENT, dispatched: true, outcome: 'published' });
    });

    it('populates the CloudEvents envelope from the FETCHED active map (no :cfg param exists)', async () => {
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'broadcast' } });

      const event = decodePublishedEvent();
      expect(event.specversion).toBe('1.0');
      expect(event.type).toBe('org.tazama.network-map.activated');
      expect(event.source).toBe('admin-service');
      expect(event.subject).toBe('DEFAULT/2.0.0');
      expect(event.datacontenttype).toBe('application/json');
      expect(event.data).toEqual({ cfg: '2.0.0', tenantId: 'DEFAULT' });
      expect(typeof event.id).toBe('string');
      expect((event.id as string).length).toBeGreaterThan(0);
      expect(event.time as string).toMatch(ISO_8601);
      expect(event).not.toHaveProperty('kind');
      expect(event).not.toHaveProperty('audience');
    });

    it('derives cfg AND tenantId from the active map, never from the request path', async () => {
      // Request tenant defaults to DEFAULT, but the active map belongs to BANK1: the published event
      // must reflect the MAP, proving the dispatch can never point at a stale/wrong cfg or tenant.
      mockGetActive.mockResolvedValue(makeMap('3.1.0', 'BANK1'));

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'broadcast' } });

      expect(response.statusCode).toBe(200);
      expect(mockGetActive).toHaveBeenCalledWith('DEFAULT');
      const event = decodePublishedEvent();
      expect(event.subject).toBe('BANK1/3.1.0');
      expect(event.data).toEqual({ cfg: '3.1.0', tenantId: 'BANK1' });
    });

    it('treats a healthy-broker publish as dispatched even though no consumer is simulated', async () => {
      // Core NATS has no PubAck and no no-responders signal, so "nobody subscribed" is invisible and
      // correctly a success - exactly what a healthy publish models here.
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'broadcast' } });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ dispatched: true });
    });
  });

  describe('reloadMode: cascade runs the detached audience-addressed wavefront -> 200', () => {
    it('returns an immediate cascade initiated status', async () => {
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'cascade' } });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ event: ACTIVATED_EVENT, dispatched: true, outcome: 'cascade initiated' });
    });

    it('starts the wavefront by addressing the event-adjudicator tier first', async () => {
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'cascade' } });
      await tick();

      expect(mockPublishServiceChannel).toHaveBeenCalled();
      const event = decodePublishedEvent(0);
      expect(event.audience).toBe('event-adjudicator');
      // The wavefront must carry the FETCHED map's identity, exactly as broadcast does.
      expect(event.subject).toBe('DEFAULT/2.0.0');
      expect(event.data).toEqual({ cfg: '2.0.0', tenantId: 'DEFAULT' });
    });
  });

  describe('producer disconnected -> loud, retryable 503 (publishing IS the whole operation)', () => {
    it('fails loudly with 503 for broadcast and never publishes', async () => {
      mockChannelConnected = false;
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'broadcast' } });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        error: 'service channel unavailable',
        event: ACTIVATED_EVENT,
        dispatched: false,
      });
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });

    it('fails loudly with 503 for cascade and starts no orchestrator', async () => {
      mockChannelConnected = false;
      mockGetActive.mockResolvedValue(makeMap('2.0.0'));

      const response = await app.inject({ method: 'POST', url: RELOAD_URL, payload: { reloadMode: 'cascade' } });
      await tick();

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({
        error: 'service channel unavailable',
        event: ACTIVATED_EVENT,
        dispatched: false,
      });
      expect(mockPublishServiceChannel).not.toHaveBeenCalled();
    });
  });
});
