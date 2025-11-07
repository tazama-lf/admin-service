// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const QueryEntityConditionSchema = Type.Object({
  id: Type.String(),
  schmenm: Type.String(),
  activeonly: Type.Optional(Type.Union([Type.Literal('no'), Type.Literal('yes')])),
  synccache: Type.Optional(Type.Union([Type.Literal('no'), Type.Literal('all'), Type.Literal('active'), Type.Literal('default')])),
});

export type QueryEntityCondition = Static<typeof QueryEntityConditionSchema>;
