// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export type RuleResult = Static<typeof RuleResult>;
export const RuleResult = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  subRuleRef: Type.String(),
  reason: Type.Optional(Type.String()),
  prcgTm: Type.Optional(Type.Number()),
  wght: Type.Optional(Type.Number()),
});
