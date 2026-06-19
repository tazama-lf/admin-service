// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces/NetworkMap';

// Branch-coverage tests for the degraded paths in services/cascade.ts and services/serviceChannel.ts:
// - publishNetworkMapActivated when the producer handle is missing
// - publishNetworkMapActivated when the underlying publish throws a non-Error
// - dispatchCascade when the producer handle is missing
// - runCascade when publishTier returns undefined (producer missing) -> stalled
// - dispatchCascade's .catch when runCascade rejects
//
// Each test isolates module state so it can substitute a different '../../src' mock
// for the publisher/connection wiring.

const makeMap = (): NetworkMap => ({
  active: true,
  cfg: 'nm-001@1.0.0',
  tenantId: 'tenant-1',
  messages: [
    { id: 'msg-001', cfg: 'msg-cfg@1.0.0', txTp: 'pacs.008.001.10', typologies: [{ id: 'typology-001', cfg: 'a@1.0.0', rules: [] }] },
  ],
});

const baseConfiguration = {
  functionName: 'admin-service',
  SERVICE_CHANNEL_SOURCE_URI_PREFIX: '' as string | undefined,
  SERVICE_CHANNEL_PRODUCER: 'service-channel' as string | undefined,
  SERVICE_CHANNEL_CONSUMER: 'service-channel-ack' as string | undefined,
};

interface SrcMockOpts {
  connected?: boolean;
  producer?: unknown;
  log?: jest.Mock;
  warn?: jest.Mock;
  error?: jest.Mock;
}

const installSrcMock = (opts: SrcMockOpts): void => {
  jest.doMock('../../src', () => ({
    configuration: baseConfiguration,
    loggerService: {
      log: opts.log ?? jest.fn(),
      warn: opts.warn ?? jest.fn(),
      error: opts.error ?? jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    },
    serviceChannelProducer: opts.producer,
    isServiceChannelConnected: opts.connected === undefined ? (): boolean => true : (): boolean => opts.connected as boolean,
  }));
};

beforeEach(() => {
  jest.resetModules();
});

afterEach(() => {
  jest.dontMock('../../src');
});

describe('publishNetworkMapActivated - producer handle missing (serviceChannel.ts:61-63)', () => {
  it('returns service channel unavailable when the producer is undefined', async () => {
    installSrcMock({ connected: true, producer: undefined });
    const { publishNetworkMapActivated } =
      require('../../src/services/serviceChannel') as typeof import('../../src/services/serviceChannel');

    const result = await publishNetworkMapActivated('nm-001@1.0.0', 'tenant-1');

    expect(result).toEqual({ status: false, outcome: 'service channel unavailable' });
  });

  it('returns service channel unavailable when publishServiceChannel is not a function', async () => {
    installSrcMock({ connected: true, producer: { publishServiceChannel: 'not-a-function' } });
    const { publishNetworkMapActivated } =
      require('../../src/services/serviceChannel') as typeof import('../../src/services/serviceChannel');

    const result = await publishNetworkMapActivated('nm-001@1.0.0', 'tenant-1');

    expect(result).toEqual({ status: false, outcome: 'service channel unavailable' });
  });
});

describe('publishNetworkMapActivated - non-Error publish failure (serviceChannel.ts:87-88)', () => {
  it('warns with the unknown-error fallback line and returns publish failed when the publish rejects with a non-Error', async () => {
    const warn = jest.fn();
    installSrcMock({
      connected: true,
      producer: { publishServiceChannel: jest.fn().mockRejectedValue('a bare string, not an Error' as never) as unknown },
      warn,
    });
    const { publishNetworkMapActivated } =
      require('../../src/services/serviceChannel') as typeof import('../../src/services/serviceChannel');

    const result = await publishNetworkMapActivated('nm-001@1.0.0', 'tenant-1');

    expect(result).toEqual({ status: false, outcome: 'publish failed' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('unknown error');
  });
});

describe('dispatchCascade - producer handle missing (cascade.ts:169-171)', () => {
  it('returns service channel unavailable and starts no orchestrator when the producer is undefined', async () => {
    installSrcMock({ connected: true, producer: undefined });
    const { dispatchCascade } = require('../../src/services/cascade') as typeof import('../../src/services/cascade');

    const result = dispatchCascade(makeMap(), 'nm-001@1.0.0', 'tenant-1');

    expect(result).toEqual({ status: false, outcome: 'service channel unavailable' });
  });

  it('returns service channel unavailable when publishServiceChannel is not a function', async () => {
    installSrcMock({ connected: true, producer: { publishServiceChannel: 42 } });
    const { dispatchCascade } = require('../../src/services/cascade') as typeof import('../../src/services/cascade');

    const result = dispatchCascade(makeMap(), 'nm-001@1.0.0', 'tenant-1');

    expect(result).toEqual({ status: false, outcome: 'service channel unavailable' });
  });
});

describe('runCascade - publishTier degraded (cascade.ts:85-87, 145-148)', () => {
  it('returns stalled at the first tier and logs error when the producer handle disappears mid-flight', async () => {
    const error = jest.fn();
    // Connected (so dispatchCascade is not the gate), but publishServiceChannel is not a function inside publishTier.
    installSrcMock({ connected: true, producer: { publishServiceChannel: undefined }, error });
    const { runCascade } = require('../../src/services/cascade') as typeof import('../../src/services/cascade');

    const result = await runCascade(makeMap(), 'nm-001@1.0.0', 'tenant-1');

    expect(result).toEqual({ converged: false, stalledTier: 'event-adjudicator' });
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('event-adjudicator');
    expect(String(error.mock.calls[0][0]).toLowerCase()).toContain('service channel unavailable');
  });
});

describe('dispatchCascade - .catch on runCascade rejection (cascade.ts:173-175)', () => {
  it('logs at error when the detached runCascade rejects', async () => {
    const error = jest.fn();
    // Producer is a function that throws synchronously, which inside publishTier becomes a rejected promise.
    // To make runCascade itself REJECT (not just stall), we make construct/publish blow up unrecoverably.
    // The simplest reliable lever: a publish that throws so publishTier rejects, but publishTier is wrapped
    // in await inside runCascade with no try/catch -> runCascade rejects -> dispatchCascade .catch fires.
    installSrcMock({
      connected: true,
      producer: {
        publishServiceChannel: jest.fn().mockImplementation(() => {
          throw new Error('boom');
        }) as unknown,
      },
      error,
    });
    const { dispatchCascade } = require('../../src/services/cascade') as typeof import('../../src/services/cascade');

    const status = dispatchCascade(makeMap(), 'nm-001@1.0.0', 'tenant-1');
    expect(status).toEqual({ status: true, outcome: 'cascade initiated' });

    // Let the detached promise settle and the .catch run.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(error).toHaveBeenCalled();
    const lines = error.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('Cascade orchestrator crashed'))).toBe(true);
  });
});
