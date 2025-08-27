// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';
import { RuleResult } from './RuleResultSchema';
import { WorkFlow } from './TypologySchema';

export type TypologyResult = Static<typeof TypologyResult>;
export const TypologyResult = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  prcgTm: Type.Optional(Type.Number()),
  result: Type.Number(),
  review: Type.Optional(Type.Boolean()),
  ruleResults: Type.Array(RuleResult),
  workflow: WorkFlow,
});
