// SPDX-License-Identifier: Apache-2.0
// A separate ioredis client just for the rate-limit store — not the shared Cache.DISTRIBUTED
// connection, which isn't guaranteed to expose the raw ioredis interface @fastify/rate-limit needs.
// Built like frms-coe-lib's own RedisService: cluster vs. single-node, reading host/port from
// redisConfig.servers[0] rather than a flat host/port field.
import Redis, { Cluster } from 'ioredis';
import type { RedisConfig } from '@tazama-lf/frms-coe-lib/lib/interfaces';

const PRIMARY_SERVER_INDEX = 0;
const MAX_RETRIES = 10;
const RECONNECT_DELAY_MS = 500;

export const createRateLimitRedisClient = (redisConfig: RedisConfig): Redis | Cluster => {
  if (redisConfig.isCluster) {
    return new Cluster(redisConfig.servers, {
      scaleReads: 'all',
      redisOptions: {
        db: redisConfig.db,
        password: redisConfig.password,
        connectTimeout: 500,
        maxRetriesPerRequest: 1,
      },
      clusterRetryStrategy(times) {
        if (times >= MAX_RETRIES) return null;
        return RECONNECT_DELAY_MS;
      },
    });
  }

  return new Redis({
    db: redisConfig.db,
    host: redisConfig.servers[PRIMARY_SERVER_INDEX].host,
    port: redisConfig.servers[PRIMARY_SERVER_INDEX].port,
    password: redisConfig.password,
    // Fail fast instead of queueing requests if Redis is slow/unreachable (@fastify/rate-limit's own recommendation).
    connectTimeout: 500,
    maxRetriesPerRequest: 1,
  });
};
