// SPDX-License-Identifier: Apache-2.0
import { construct, deserialize, ServiceChannelType, validateEnvelope } from '@tazama-lf/frms-coe-lib';
import type { NetworkMapActivatedData } from '@tazama-lf/frms-coe-lib/lib/interfaces/service-channel';
import { configuration, isServiceChannelConnected, loggerService, serviceChannelProducer } from '..';
import * as util from 'node:util';

export interface ReloadDispatchStatus {
  status: boolean;
  outcome: string;
}

/**
 * The reply payload read off each ack: which activation it acks and how the consumer fared. Not a
 * compile-time contract (no shared lib type) - a cross-service convention read defensively off the wire.
 */
interface ServiceChannelAckData {
  correlationId?: string;
  outcome?: 'success' | 'error';
  error?: string;
}

/**
 * The B3 fire-and-log ack sink: logs one advisory line per inbound ack on the reply subject. A
 * `success` (or thin/unknown) outcome logs at info; an `error` outcome escalates to `error` so a failed
 * fulfilment of an activation admin-service dispatched is surfaced. Advisory only - it never publishes
 * back and never touches the activation path. Every code path is wrapped so it can never reject: a
 * rejection would tear down the `for await` subscription loop, so a malformed ack is a swallowed warn.
 */
export const handleServiceChannelAck = async (data: Uint8Array): Promise<void> => {
  try {
    const ack = deserialize<ServiceChannelAckData>(data);
    const { correlationId, outcome, error } = ack.data ?? {};
    const line =
      `Service-channel ack received (type: ${ack.type}, source: ${ack.source}, ` +
      `correlationId: ${correlationId}, outcome: ${outcome})${error !== undefined ? `: ${error}` : ''}`;
    if (outcome === 'error') {
      loggerService.error(line);
    } else {
      loggerService.log(line);
    }
  } catch (err) {
    loggerService.warn(`Discarding malformed service-channel ack: ${util.inspect(err)}`);
  }
  await Promise.resolve();
};

const DEFAULT_SERVICE_CHANNEL_SUBJECT = 'service-channel';
const SERVICE_CHANNEL_UNAVAILABLE = 'service channel unavailable';

export const publishNetworkMapActivated = async (cfg: string, tenantId: string): Promise<ReloadDispatchStatus> => {
  if (typeof isServiceChannelConnected !== 'function' || !isServiceChannelConnected()) {
    return { status: false, outcome: SERVICE_CHANNEL_UNAVAILABLE };
  }

  if (!serviceChannelProducer || typeof serviceChannelProducer.publishServiceChannel !== 'function') {
    return { status: false, outcome: SERVICE_CHANNEL_UNAVAILABLE };
  }

  try {
    const event = construct<NetworkMapActivatedData>({
      type: ServiceChannelType.NETWORK_MAP_ACTIVATED,
      source: `${configuration.SERVICE_CHANNEL_SOURCE_URI_PREFIX ?? ''}${configuration.functionName}`,
      subject: `${tenantId}/${cfg}`,
      data: { cfg, tenantId },
      datacontenttype: 'application/json',
    });

    validateEnvelope<NetworkMapActivatedData>(event);

    const eventBytes = new TextEncoder().encode(JSON.stringify(event));
    await serviceChannelProducer.publishServiceChannel(
      eventBytes,
      configuration.SERVICE_CHANNEL_PRODUCER ?? DEFAULT_SERVICE_CHANNEL_SUBJECT,
    );

    return { status: true, outcome: 'published' };
  } catch (error) {
    if (error instanceof Error) {
      loggerService.warn(`Failed to publish network-map.activated: ${error.message}`);
    } else {
      loggerService.warn('Failed to publish network-map.activated: unknown error');
    }
    return { status: false, outcome: 'publish failed' };
  }
};
