// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { construct, deserialize, ServiceChannelType } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap, Typology } from '@tazama-lf/frms-coe-lib/lib/interfaces/NetworkMap';

// RED tests (#446, Part C Ph8): the detached `cascade` reload orchestrator. For a `cascade` request,
// admin-service additionally runs an orchestrator that sequences the reload as an audience-addressed,
// ack-gated topological wavefront, BACK-TO-FRONT: event-adjudicator -> typology-processor ->
// event-director. A tier is addressed (a `network-map.activated` event published with that tier's
// `audience`) only after the previous tier reaches its quorum of acks. A tier that never reaches quorum
// is an out-of-band STALL reported to loggerService.error - never the activation response. The
// activation request's latency and lifecycle are unchanged (the orchestrator is fully detached).
//
// Transport is mocked (serviceChannelProducer.publishServiceChannel). Acks are simulated by feeding the
// orchestrator's ack-ingestion seam (recordCascadeAck) or by driving the real Phase 5 sink
// (handleServiceChannelAck) with REAL construct + JSON + TextEncoder bytes (exactly how a consumer
// emits an ack), so the additive sink->orchestrator forwarding is exercised end to end.

const mockLog = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();
const mockPublish = jest.fn<(bytes: Uint8Array, subject: string) => Promise<void>>();
let channelConnected = true;

jest.mock('../../src', () => ({
  configuration: {
    functionName: 'admin-service',
    SERVICE_CHANNEL_SOURCE_URI_PREFIX: '' as string | undefined,
    SERVICE_CHANNEL_PRODUCER: 'service-channel' as string | undefined,
    SERVICE_CHANNEL_CONSUMER: 'service-channel-ack' as string | undefined,
  },
  loggerService: {
    log: (...args: unknown[]) => mockLog(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
    error: (...args: unknown[]) => mockError(...args),
    debug: (...args: unknown[]) => mockDebug(...args),
    trace: jest.fn(),
  },
  serviceChannelProducer: {
    publishServiceChannel: (...args: [Uint8Array, string]) => mockPublish(...args),
  },
  isServiceChannelConnected: () => channelConnected,
}));

import {
  CASCADE_TIER_ORDER,
  CASCADE_TIER_TIMEOUT_MS,
  dispatchCascade,
  distinctTypologyIds,
  recordCascadeAck,
  runCascade,
} from '../../src/services/cascade';
import { handleServiceChannelAck } from '../../src/services/serviceChannel';

/** Let queued microtasks (and resolved timers) settle on the real-timer path. */
const tick = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const makeTypology = (id: string, cfg: string): Typology => ({ id, cfg, rules: [] });

/** A network map whose single message carries the given typologies (the TP-tier quorum denominator). */
const makeMap = (typologies: Typology[]): NetworkMap => ({
  active: true,
  cfg: 'nm-001@1.0.0',
  tenantId: 'tenant-1',
  messages: [{ id: 'msg-001', cfg: 'msg-cfg@1.0.0', txTp: 'pacs.008.001.10', typologies }],
});

/** The audience extension stamped on the i-th published wavefront event. */
const publishedAudience = (i: number): string => String(deserialize(mockPublish.mock.calls[i][0]).audience);

/** The CloudEvent id of the i-th published event - the correlationId its tier's acks carry back. */
const publishedEventId = (i: number): string => String(deserialize(mockPublish.mock.calls[i][0]).id);

/** Encode an ack exactly as a consumer publishes it (real structured-mode CloudEvent bytes). */
const makeAckBytes = (source: string, correlationId: string, outcome: 'success' | 'error' = 'success'): Uint8Array => {
  const ack = construct<{ correlationId: string; outcome: string }>({
    type: ServiceChannelType.NETWORK_MAP_ACTIVATED,
    source,
    data: { correlationId, outcome },
    datacontenttype: 'application/json',
  });
  return new TextEncoder().encode(JSON.stringify(ack));
};

beforeEach(() => {
  mockLog.mockReset();
  mockWarn.mockReset();
  mockError.mockReset();
  mockDebug.mockReset();
  mockPublish.mockReset();
  mockPublish.mockResolvedValue(undefined);
  channelConnected = true;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('distinctTypologyIds - map-derived quorum denominator (#446 AC open-refinement)', () => {
  it('de-dupes on typology.id ALONE: two cfgs under one id are one processor', () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0'), makeTypology('typology-001', '002@1.0.0')]);

    expect(distinctTypologyIds(map)).toEqual(['typology-001']);
  });

  it('returns each distinct typology.id across all messages', () => {
    const map: NetworkMap = {
      active: true,
      cfg: 'nm-001@1.0.0',
      tenantId: 'tenant-1',
      messages: [
        {
          id: 'msg-001',
          cfg: 'm1',
          txTp: 'pacs.008.001.10',
          typologies: [makeTypology('typology-001', 'a'), makeTypology('typology-002', 'b')],
        },
        {
          id: 'msg-002',
          cfg: 'm2',
          txTp: 'pacs.002.001.12',
          typologies: [makeTypology('typology-002', 'c'), makeTypology('typology-003', 'd')],
        },
      ],
    };

    expect(distinctTypologyIds(map).sort()).toEqual(['typology-001', 'typology-002', 'typology-003']);
  });

  it('returns an empty denominator for a map with no typologies', () => {
    const map = makeMap([]);

    expect(distinctTypologyIds(map)).toEqual([]);
  });
});

describe('wavefront order + first-ack gating - single-processor tiers (#446 AC1, AC2, AC3)', () => {
  it('addresses event-adjudicator FIRST and addresses no other tier until EA acks', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(publishedAudience(0)).toBe('event-adjudicator');

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });

  it('addresses typology-processor only after EA acks, then event-director only after TP acks', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(1);

    // EA quorum -> TP is addressed.
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(publishedAudience(1)).toBe('typology-processor');

    // ED is NOT addressed until TP acks.
    expect(mockPublish).toHaveBeenCalledTimes(2);

    // TP quorum -> ED is addressed.
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(3);
    expect(publishedAudience(2)).toBe('event-director');

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });

  it('converges once event-director acks, in strict EA -> TP -> ED audience order', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');

    await expect(result).resolves.toEqual({ converged: true });
    expect(mockPublish.mock.calls.map((_, i) => publishedAudience(i))).toEqual([...CASCADE_TIER_ORDER]);
  });

  it('publishes every tier on the same producer subject - audience does the addressing, not the subject', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await result;

    for (const call of mockPublish.mock.calls) {
      expect(call[1]).toBe('service-channel');
    }
  });

  it('never addresses the rule-processor tier - rule-processors are not in the handshake (#446 AC2)', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await result;

    const audiences = mockPublish.mock.calls.map((_, i) => publishedAudience(i));
    expect(audiences).not.toContain('rule-processor');
  });
});

describe('typology-processor multi-distinct-processor quorum (#446 open-refinement)', () => {
  it('does NOT advance to event-director until EVERY distinct typology.id has acked', async () => {
    const map = makeMap([makeTypology('typology-001', 'a@1.0.0'), makeTypology('typology-002', 'b@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    expect(publishedAudience(1)).toBe('typology-processor');

    // One of two distinct processors acked - quorum NOT met, ED must not be addressed.
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(2);

    // A duplicate ack from the same processor does not advance quorum.
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(2);

    // The second distinct processor acks -> quorum met -> ED addressed.
    recordCascadeAck(publishedEventId(1), 'typology-002');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(3);
    expect(publishedAudience(2)).toBe('event-director');

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });

  it('skips the typology-processor tier entirely when the map has zero typologies (resolved option a)', async () => {
    // A zero-typology map should be rejected upstream by the configuration endpoints, but if the
    // orchestrator ever reaches a TP tier with an empty quorum denominator it has nothing to gate on,
    // so it skips TP and addresses event-director directly.
    const map = makeMap([]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(publishedAudience(0)).toBe('event-adjudicator');

    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();

    // No TP publish - the wavefront jumps straight to event-director.
    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(publishedAudience(1)).toBe('event-director');

    recordCascadeAck(publishedEventId(1), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });

    const audiences = mockPublish.mock.calls.map((_, i) => publishedAudience(i));
    expect(audiences).not.toContain('typology-processor');
  });
});

describe('stall surface - a tier that never reaches quorum (#446 AC5)', () => {
  it('reports the stalled tier to loggerService.error, addresses no downstream tier, and resolves (never rejects)', async () => {
    jest.useFakeTimers();
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await jest.advanceTimersByTimeAsync(0);
    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(publishedAudience(0)).toBe('event-adjudicator');

    // EA never acks; advance past the per-tier window.
    await jest.advanceTimersByTimeAsync(CASCADE_TIER_TIMEOUT_MS + 1);

    await expect(result).resolves.toEqual({ converged: false, stalledTier: 'event-adjudicator' });
    expect(mockError).toHaveBeenCalledTimes(1);
    const line = String(mockError.mock.calls[0][0]);
    expect(line).toContain('event-adjudicator');
    expect(line.toLowerCase()).toContain('stall');
    // The wavefront aborts at the stalled tier - TP/ED are never addressed.
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });
});

describe('dispatchCascade - fire-and-return (#446 AC1, lifecycle unchanged)', () => {
  it('returns synchronously as initiated WITHOUT awaiting convergence', async () => {
    jest.useFakeTimers();
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const status = dispatchCascade(map, map.cfg, map.tenantId);

    // The route gets an immediate status; the orchestrator runs detached beyond the request.
    expect(status).toEqual({ status: true, outcome: 'cascade initiated' });

    // Let the detached cascade stall out so the test leaves no dangling timer.
    await jest.advanceTimersByTimeAsync(CASCADE_TIER_TIMEOUT_MS + 1);
  });

  it('degrades to an unavailable status (and starts no orchestrator) when the service channel is down', () => {
    channelConnected = false;
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const status = dispatchCascade(map, map.cfg, map.tenantId);

    expect(status.status).toBe(false);
    expect(status.outcome).toBe('service channel unavailable');
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('Phase 5 sink additively forwards acks to the orchestrator (#446 AC3)', () => {
  it('drives an in-flight cascade forward when an ack arrives through the real handleServiceChannelAck sink', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(1);

    // A real EA ack delivered through the fire-and-log sink must advance the wavefront to TP.
    await handleServiceChannelAck(makeAckBytes('event-adjudicator', publishedEventId(0)));
    await tick();

    expect(mockPublish).toHaveBeenCalledTimes(2);
    expect(publishedAudience(1)).toBe('typology-processor');
    // The sink keeps its advisory fire-and-log behaviour for the same ack.
    expect(mockLog).toHaveBeenCalled();

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });

  it('does NOT advance the wavefront when a forwarded ack reports an error outcome (delivery is not adoption)', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(1);

    // An error-outcome ack proves the consumer received the event but FAILED to adopt the map - the EA
    // tier quorum stays unmet, so no downstream tier is addressed.
    await handleServiceChannelAck(makeAckBytes('event-adjudicator', publishedEventId(0), 'error'));
    await tick();

    expect(mockPublish).toHaveBeenCalledTimes(1);
    // The sink still surfaces the failed adoption on its error channel.
    expect(mockError).toHaveBeenCalled();

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });
});

describe('ack ingestion robustness - acks with no matching waiter (#446 AC3)', () => {
  it('ignores an ack for an unknown correlationId without throwing or addressing any tier', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(1);

    expect(() => {
      recordCascadeAck('no-such-correlation-id', 'event-adjudicator');
    }).not.toThrow();
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(1);

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });

  it('ignores a late, repeat ack for an already-converged tier (no double-advance)', async () => {
    const map = makeMap([makeTypology('typology-001', '001@1.0.0')]);

    const result = runCascade(map, map.cfg, map.tenantId);
    await tick();
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(2);

    // The EA tier already settled; a repeat ack for its correlationId must not re-fire anything.
    recordCascadeAck(publishedEventId(0), 'event-adjudicator');
    await tick();
    expect(mockPublish).toHaveBeenCalledTimes(2);

    // Settle the detached cascade so the test leaves no live per-tier timer or abandoned waiter.
    recordCascadeAck(publishedEventId(1), 'typology-001');
    await tick();
    recordCascadeAck(publishedEventId(2), 'event-director');
    await expect(result).resolves.toEqual({ converged: true });
  });
});
