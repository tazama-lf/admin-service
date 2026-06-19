// SPDX-License-Identifier: Apache-2.0
import { construct, ServiceChannelType, validateEnvelope } from '@tazama-lf/frms-coe-lib';
import type { NetworkMap } from '@tazama-lf/frms-coe-lib/lib/interfaces/NetworkMap';
import type { NetworkMapActivatedData } from '@tazama-lf/frms-coe-lib/lib/interfaces/service-channel';
import * as util from 'node:util';
import { configuration, isServiceChannelConnected, loggerService, serviceChannelProducer } from '..';
import type { ReloadDispatchStatus } from './serviceChannel';

/**
 * The topological wavefront order for a `cascade` reload: most-downstream first. event-adjudicator
 * (the terminal adopter) is addressed first, then typology-processor, then event-director - each tier
 * adopts the new map only after its immediate downstream has confirmed (acked) it is subscribed.
 */
export const CASCADE_TIER_ORDER = ['event-adjudicator', 'typology-processor', 'event-director'] as const;
export type CascadeTier = (typeof CASCADE_TIER_ORDER)[number];

/** Per-tier quorum window. A tier that does not reach quorum within this is an out-of-band stall. */
export const CASCADE_TIER_TIMEOUT_MS = 30_000;

const DEFAULT_SERVICE_CHANNEL_SUBJECT = 'service-channel';
const SERVICE_CHANNEL_UNAVAILABLE = 'service channel unavailable';

export interface CascadeResult {
  converged: boolean;
  stalledTier?: CascadeTier;
}

/**
 * A live per-tier wait for quorum, held in the in-memory registry keyed by the tier's outbound
 * correlationId (the published CloudEvent id its acks carry back). `required` is the set of ack sources
 * that must each ack to reach quorum; an EMPTY `required` is a first-ack tier (any single ack settles it).
 */
interface TierWaiter {
  required: Set<string>;
  acked: Set<string>;
  settle: (reached: boolean) => void;
}

/** correlationId (outbound event id) -> the tier currently waiting on acks for that event. */
const registry = new Map<string, TierWaiter>();

/**
 * The map-derived quorum denominator for the typology-processor tier: the distinct typology PROCESSOR
 * set, `distinct(typology.id)` across `messages[].typologies[]`, de-duped on `id` ALONE. `cfg` is the
 * typology config that processor evaluates, not a processor-identity axis, so it must not widen the key.
 */
export const distinctTypologyIds = (activated: NetworkMap): string[] => {
  const ids = new Set<string>();
  for (const message of activated.messages) {
    for (const typology of message.typologies) {
      ids.add(typology.id);
    }
  }
  return [...ids];
};

/**
 * Ack ingestion seam. The Phase 5 fire-and-log sink forwards every SUCCESSFUL inbound ack here (keyed by
 * `data.correlationId` + the ack's `source`); a detached cascade waiting on that correlationId advances
 * when its tier reaches quorum. A no-op when no cascade is waiting (broadcast-mode acks just log), for an
 * unknown correlationId, or for a late ack on an already-settled tier. A source outside the required set,
 * or a duplicate ack from an already-counted source, does not advance quorum.
 */
export const recordCascadeAck = (correlationId: string, source: string): void => {
  const waiter = registry.get(correlationId);
  if (!waiter) return;

  // First-ack tier (EA, ED): any single ack proves the route is live.
  if (waiter.required.size === 0) {
    waiter.settle(true);
    return;
  }

  // Multi-distinct tier (TP): one ack per distinct required processor identity.
  if (waiter.required.has(source)) {
    waiter.acked.add(source);
    if (waiter.acked.size >= waiter.required.size) {
      waiter.settle(true);
    }
  }
};

/** Publish one tier's audience-addressed `network-map.activated` event; returns its correlationId (event id). */
const publishTier = async (cfg: string, tenantId: string, audience: CascadeTier): Promise<string | undefined> => {
  if (!serviceChannelProducer || typeof serviceChannelProducer.publishServiceChannel !== 'function') {
    return undefined;
  }

  const event = construct<NetworkMapActivatedData>({
    type: ServiceChannelType.NETWORK_MAP_ACTIVATED,
    source: `${configuration.SERVICE_CHANNEL_SOURCE_URI_PREFIX ?? ''}${configuration.functionName}`,
    subject: `${tenantId}/${cfg}`,
    data: { cfg, tenantId },
    datacontenttype: 'application/json',
    audience,
  });

  validateEnvelope<NetworkMapActivatedData>(event);

  const eventBytes = new TextEncoder().encode(JSON.stringify(event));
  await serviceChannelProducer.publishServiceChannel(eventBytes, configuration.SERVICE_CHANNEL_PRODUCER ?? DEFAULT_SERVICE_CHANNEL_SUBJECT);

  return event.id;
};

/** Register a waiter for `correlationId` and resolve true on quorum or false on the per-tier timeout. */
const waitForTierQuorum = async (correlationId: string, required: string[]): Promise<boolean> =>
  // A registry-settled waiter is an inherently deferred promise: it is resolved out-of-band by
  // `recordCascadeAck` (on quorum) or by the timeout (on stall), so `new Promise` is the correct primitive here.
  // eslint-disable-next-line promise/avoid-new -- deferred waiter settled out-of-band by recordCascadeAck or the stall timeout
  await new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (reached: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      registry.delete(correlationId);
      resolve(reached);
    };
    const timer = setTimeout(() => {
      settle(false);
    }, CASCADE_TIER_TIMEOUT_MS);
    // A detached cascade must never keep the process alive on its own account.
    if (typeof timer.unref === 'function') timer.unref();
    registry.set(correlationId, { required: new Set(required), acked: new Set(), settle });
  });

/**
 * The detached orchestrator. Sequences the audience-addressed, ack-gated wavefront EA -> TP -> ED,
 * addressing each tier only after the previous tier reaches its first-ack (or per-distinct-processor)
 * quorum. A typology-processor tier with no required responders is skipped straight to event-director.
 * A tier that never reaches quorum is reported to the error log surface and the cascade aborts; this
 * resolves (never throws) so it can run fully detached from the activation request.
 */
export const runCascade = async (activated: NetworkMap, cfg: string, tenantId: string): Promise<CascadeResult> => {
  for (const tier of CASCADE_TIER_ORDER) {
    const required = tier === 'typology-processor' ? distinctTypologyIds(activated) : [];

    // Zero-required-responder typology-processor tier: nothing to gate on, skip straight to ED.
    if (tier === 'typology-processor' && required.length === 0) {
      continue;
    }

    const correlationId = await publishTier(cfg, tenantId, tier);
    if (correlationId === undefined) {
      loggerService.error(`Cascade stalled at tier ${tier}: unable to publish (service channel unavailable)`);
      return { converged: false, stalledTier: tier };
    }

    const reached = await waitForTierQuorum(correlationId, required);
    if (!reached) {
      loggerService.error(`Cascade stalled at tier ${tier}: quorum not reached within ${CASCADE_TIER_TIMEOUT_MS}ms`);
      return { converged: false, stalledTier: tier };
    }
  }

  return { converged: true };
};

/**
 * Route-facing fire-and-return initiator for a `cascade` request: kicks off `runCascade` detached and
 * returns immediately so the activation response's latency and lifecycle stay unchanged (as in broadcast).
 * Degrades (never throws) when the service channel is down, starting no orchestrator.
 */
export const dispatchCascade = (activated: NetworkMap, cfg: string, tenantId: string): ReloadDispatchStatus => {
  if (typeof isServiceChannelConnected !== 'function' || !isServiceChannelConnected()) {
    return { status: false, outcome: SERVICE_CHANNEL_UNAVAILABLE };
  }
  if (!serviceChannelProducer || typeof serviceChannelProducer.publishServiceChannel !== 'function') {
    return { status: false, outcome: SERVICE_CHANNEL_UNAVAILABLE };
  }

  void runCascade(activated, cfg, tenantId).catch((err: unknown) => {
    loggerService.error(`Cascade orchestrator crashed: ${util.inspect(err)}`);
  });

  return { status: true, outcome: 'cascade initiated' };
};
