// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';

export type AccountHolderSchema = Static<typeof AccountHolderSchema>;
export const AccountHolderSchema = Type.Object({
  entityId: Type.String(),
  accountId: Type.String(),
  CreDtTm: Type.String(),
});
