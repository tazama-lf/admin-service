// SPDX-License-Identifier: Apache-2.0
import { construct, ServiceChannelType, validateEnvelope } from '@tazama-lf/frms-coe-lib';
import type { NetworkMapActivatedData } from '@tazama-lf/frms-coe-lib/lib/interfaces/service-channel';
import { configuration, isServiceChannelConnected, loggerService, serviceChannelProducer } from '..';

export interface ReloadDispatchStatus {
  status: boolean;
  outcome: string;
}

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
