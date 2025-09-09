// SPDX-License-Identifier: Apache-2.0

export const generateTenantEntityKey = (entityId: string, schemeNm: string, tenantId: string): string =>
  `${tenantId}:${entityId}:${schemeNm}`;

export const generateTenantAccountKey = (accountId: string, schemeNm: string, memberId: string, tenantId: string): string =>
  `${tenantId}:${accountId}:${schemeNm}:${memberId}`;
