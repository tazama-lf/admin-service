// SPDX-License-Identifier: Apache-2.0
import { loggerService } from '../index';

interface TenantGroupCache {
  tenantId: string;
  groupName: string;
  timestamp: number;
  ttl: number;
}
class AutoDiscoveryCache {
  private readonly cache = new Map<string, TenantGroupCache>();
  private readonly DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes

  getCachedGroup(tenantId: string): string | null {
    const cacheKey = `tenant:${tenantId}`;
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now > cached.timestamp + cached.ttl) {
      this.cache.delete(cacheKey);
      loggerService.log(`  Cache expired for tenant '${tenantId}' group mapping`);
      return null;
    }

    loggerService.log(`Cache hit: tenant '${tenantId}' -> group '${cached.groupName}'`);
    return cached.groupName;
  }

  cacheGroup(tenantId: string, groupName: string, ttlMs?: number): void {
    const cacheKey = `tenant:${tenantId}`;
    const ttl = ttlMs ?? this.DEFAULT_TTL;

    this.cache.set(cacheKey, {
      tenantId,
      groupName,
      timestamp: Date.now(),
      ttl,
    });

    loggerService.log(` Cached: tenant '${tenantId}' -> group '${groupName}' (TTL: ${ttl / 1000 / 60} min)`);
  }

  hasCachedGroup(tenantId: string): boolean {
    return this.getCachedGroup(tenantId) !== null;
  }

  clearTenant(tenantId: string): void {
    const cacheKey = `tenant:${tenantId}`;
    this.cache.delete(cacheKey);
    loggerService.log(`  Cleared cache for tenant '${tenantId}'`);
  }

  clearAll(): void {
    const { size } = this.cache;
    this.cache.clear();
    loggerService.log(`  Cleared all auto-discovery cache (${size} entries)`);
  }

  getStats(): {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    entries: Array<{ tenantId: string; groupName: string; ageMinutes: number; isExpired: boolean }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.values());

    const stats = {
      totalEntries: entries.length,
      validEntries: 0,
      expiredEntries: 0,
      entries: entries.map((entry) => {
        const ageMs = now - entry.timestamp;
        const ageMinutes = Math.floor(ageMs / 60000);
        const isExpired = ageMs > entry.ttl;

        if (isExpired) {
          this.stats.expiredEntries++;
        } else {
          this.stats.validEntries++;
        }

        return {
          tenantId: entry.tenantId,
          groupName: entry.groupName,
          ageMinutes,
          isExpired,
        };
      }),
    };

    return stats;
  }

  private readonly stats = { validEntries: 0, expiredEntries: 0 };

  cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.timestamp + cached.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      loggerService.log(`Cleaned up ${removedCount} expired auto-discovery cache entries`);
    }
  }
}

export const autoDiscoveryCache = new AutoDiscoveryCache();

setInterval(
  () => {
    autoDiscoveryCache.cleanup();
  },
  5 * 60 * 1000,
);
