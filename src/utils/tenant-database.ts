// SPDX-License-Identifier: Apache-2.0

/**
 * Tenant-aware database utilities for multi-tenant support
 * Provides functions to handle tenant-specific unique keys and database operations
 */

/**
 * Generate tenant-aware unique key for entities
 * Format: {tenantId}:{entityId}:{schemeNm}
 */
export const generateTenantEntityKey = (entityId: string, schemeNm: string, tenantId: string): string =>
  `${tenantId}:${entityId}:${schemeNm}`;

/**
 * Generate tenant-aware unique key for accounts
 * Format: {tenantId}:{accountId}:{schemeNm}:{memberId}
 */
export const generateTenantAccountKey = (accountId: string, schemeNm: string, memberId: string, tenantId: string): string =>
  `${tenantId}:${accountId}:${schemeNm}:${memberId}`;

/**
 * Generate tenant-aware unique key for conditions
 * Format: {tenantId}:{conditionId}
 */
export const generateTenantConditionKey = (conditionId: string, tenantId: string): string => `${tenantId}:${conditionId}`;

/**
 * Generate tenant-aware edge key for governed relationships
 * Format: {tenantId}:{sourceKey}:{targetKey}
 */
export const generateTenantEdgeKey = (sourceKey: string, targetKey: string, tenantId: string): string =>
  `${tenantId}:${sourceKey}:${targetKey}`;

/**
 * Parse tenant-aware key to extract components
 */
export const parseTenantKey = (tenantKey: string): { tenantId: string; components: string[] } => {
  const parts = tenantKey.split(':');
  if (parts.length < 2) {
    throw new Error(`Invalid tenant key format: ${tenantKey}`);
  }

  return {
    tenantId: parts[0],
    components: parts.slice(1),
  };
};

/**
 * Validate that a record belongs to the specified tenant
 */
export const validateTenantOwnership = (recordTenantId: string | undefined, requestTenantId: string): boolean => {
  // Handle legacy records without tenant info (assume DEFAULT tenant)
  if (!recordTenantId) {
    return requestTenantId === 'DEFAULT' || requestTenantId === 'default';
  }

  return recordTenantId === requestTenantId;
};

/**
 * Create tenant-aware collection name
 * For database collections that need tenant separation
 */
export const getTenantCollectionName = (baseCollectionName: string, tenantId: string): string =>
  // For now, we use a single collection with tenant-aware keys
  // Future enhancement could use separate collections per tenant
  baseCollectionName;

/**
 * Database query filter for tenant isolation
 */
export const createTenantFilter = (tenantId: string): { tenantId: string } => ({
  tenantId,
});
