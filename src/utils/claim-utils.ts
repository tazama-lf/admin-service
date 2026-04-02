// SPDX-License-Identifier: Apache-2.0

export type Claim = string | string[];

/**
 * Normalizes a claim (single string or array) into a flat array of claim strings.
 */
export const normalizeClaims = (claim: Claim): string[] => (Array.isArray(claim) ? claim : [claim]);

/**
 * Checks if any one of the provided claims is valid in the validation result.
 * Returns true if at least one claim passes (OR logic).
 */
export const hasAnyClaim = (claims: string[], validated: Record<string, unknown>): boolean => claims.some((c) => validated[c]);
