// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';

export type AccountHolderSchema = Static<typeof AccountHolderSchema>;
export const AccountHolderSchema = Type.Object({
  source: Type.String(),
  destination: Type.String(),
  credttm: Type.String(),
});
