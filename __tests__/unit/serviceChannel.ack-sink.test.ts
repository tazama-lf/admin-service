// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { construct, ServiceChannelType } from '@tazama-lf/frms-coe-lib';

// RED tests (#445, Part C Ph5): the B3 fire-and-log ack sink. A standing subscription on the reply
// subject (SERVICE_CHANNEL_CONSUMER) hands each inbound ack's raw bytes to `handleServiceChannelAck`,
// which logs exactly one advisory line per ack - reading type, correlationId, source (the acking
// instance) and outcome. A `success` ack logs at info (`loggerService.log`); an `error` ack escalates
// to `loggerService.error` (admin-service issued the instruction and wants downstream failures
// surfaced), carrying the consumer's error. It is advisory only: it never publishes back, never
// touches the activation path, and never rejects (a malformed payload is a swallowed warn line, so a
// single bad message can never tear down the for-await subscription).
//
// Inbound ack bytes are built with the REAL construct + JSON.stringify + TextEncoder (exactly how
// event-director emits acks), so the test exercises the real deserialize round-trip.

const mockLog = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockPublishServiceChannel = jest.fn();

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
    trace: jest.fn(),
    debug: jest.fn(),
  },
  serviceChannelProducer: {
    publishServiceChannel: (...args: unknown[]) => mockPublishServiceChannel(...args),
  },
  isServiceChannelConnected: () => true,
}));

import { handleServiceChannelAck } from '../../src/services/serviceChannel';

interface AckData {
  correlationId: string;
  outcome: 'success' | 'error';
  error?: string;
}

/** Encode a structured-mode CloudEvent ack exactly as event-director publishes it. */
const makeAckBytes = (source: string, correlationId: string, outcome: 'success' | 'error', error?: string): Uint8Array => {
  const ack = construct<AckData>({
    type: ServiceChannelType.NETWORK_MAP_ACTIVATED,
    source,
    data: { correlationId, outcome, ...(error !== undefined ? { error } : {}) },
    datacontenttype: 'application/json',
  });
  return new TextEncoder().encode(JSON.stringify(ack));
};

describe('handleServiceChannelAck - B3 fire-and-log ack sink (#445)', () => {
  beforeEach(() => {
    mockLog.mockReset();
    mockWarn.mockReset();
    mockError.mockReset();
    mockPublishServiceChannel.mockReset();
  });

  it('logs exactly one line for a success ack, carrying type, correlationId, source and outcome', async () => {
    await handleServiceChannelAck(makeAckBytes('event-director', 'corr-success-1', 'success'));

    expect(mockLog).toHaveBeenCalledTimes(1);
    const line = String(mockLog.mock.calls[0][0]);
    expect(line).toContain('network-map.activated');
    expect(line).toContain('corr-success-1');
    expect(line).toContain('event-director');
    expect(line).toContain('success');
    // A well-formed ack is advisory info, never a warning.
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('escalates an error ack to loggerService.error, carrying correlationId, source, outcome and the error string', async () => {
    await handleServiceChannelAck(makeAckBytes('rule-processor', 'corr-error-1', 'error', 'tenantId missing'));

    expect(mockError).toHaveBeenCalledTimes(1);
    const line = String(mockError.mock.calls[0][0]);
    expect(line).toContain('corr-error-1');
    expect(line).toContain('rule-processor');
    expect(line).toContain('error');
    expect(line).toContain('tenantId missing');
    // An error-outcome ack is not a benign info line.
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('logs every ack independently when multiple arrive, by outcome severity', async () => {
    await handleServiceChannelAck(makeAckBytes('event-director', 'corr-a', 'success'));
    await handleServiceChannelAck(makeAckBytes('typology-processor', 'corr-b', 'error', 'boom'));
    await handleServiceChannelAck(makeAckBytes('rule-processor', 'corr-c', 'success'));

    // Two success acks at info, one error ack escalated - each surfaced exactly once.
    expect(mockLog).toHaveBeenCalledTimes(2);
    expect(mockError).toHaveBeenCalledTimes(1);
    const infoLines = mockLog.mock.calls.map((call) => String(call[0]));
    expect(infoLines.some((line) => line.includes('corr-a'))).toBe(true);
    expect(infoLines.some((line) => line.includes('corr-c'))).toBe(true);
    expect(String(mockError.mock.calls[0][0])).toContain('corr-b');
  });

  it('swallows a malformed (non-JSON) payload: resolves, logs no ack line, warns instead', async () => {
    const badBytes = new TextEncoder().encode('not-json{');

    await expect(handleServiceChannelAck(badBytes)).resolves.toBeUndefined();
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it('never rejects even on a malformed payload (the for-await subscription must not tear down)', async () => {
    const badBytes = new TextEncoder().encode('\u0000\u0001 not a cloudevent');

    await expect(handleServiceChannelAck(badBytes)).resolves.toBeUndefined();
  });

  it('reads defensively: a valid envelope with thin data still logs one advisory line, never throws', async () => {
    // ServiceChannelAckData is a cross-service convention, not a compile-time contract, so the sink
    // must tolerate a structurally valid CloudEvent whose data fields are absent.
    const thin = construct<Record<string, never>>({
      type: ServiceChannelType.NETWORK_MAP_ACTIVATED,
      source: 'event-director',
      datacontenttype: 'application/json',
    });
    const bytes = new TextEncoder().encode(JSON.stringify(thin));

    await expect(handleServiceChannelAck(bytes)).resolves.toBeUndefined();
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(String(mockLog.mock.calls[0][0])).toContain('event-director');
  });

  it('is advisory only: never publishes back and never touches the activation path', async () => {
    await handleServiceChannelAck(makeAckBytes('event-director', 'corr-advisory', 'success'));

    expect(mockPublishServiceChannel).not.toHaveBeenCalled();
  });
});
