// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const ExpireAccountConditionSchema = Type.Object({
  id: Type.String(),
  schmenm: Type.String(),
  agt: Type.String(),
  condid: Type.String(),
});

export type ExpireAccountCondition = Static<typeof ExpireAccountConditionSchema>;
