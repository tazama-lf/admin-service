// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const ExpireEntityConditionSchema = Type.Object({
  id: Type.String(),
  schmenm: Type.String(),
  condid: Type.String(),
});

export type ExpireEntityCondition = Static<typeof ExpireEntityConditionSchema>;
