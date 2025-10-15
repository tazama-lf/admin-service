// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';

export type IWeight = Static<typeof IWeight>;
export const IWeight = Type.Object({
  ref: Type.String(),
  wght: Type.Number(),
});

export type IRuleValue = Static<typeof IRuleValue>;
export const IRuleValue = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  wghts: Type.Array(IWeight),
  termId: Type.String(),
});

export type IRule = Static<typeof IRule>;
export const IRule = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  ref: Type.Optional(Type.String()),
});

export type ExpressionMathJSON = Static<typeof ExpressionMathJSON>;
export const ExpressionMathJSON = Type.Recursive((This) => Type.Array(Type.Union([Type.String(), Type.Number(), This])));

export const WorkFlow = Type.Object({
  alertThreshold: Type.Number(),
  interdictionThreshold: Type.Optional(Type.Number()),
  flowProcessor: Type.Optional(Type.String()),
});

export type TypologySchema = Static<typeof TypologySchema>;
export const TypologySchema = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  tenantId: Type.Optional(Type.String({ default: 'DEFAULT' })),
  desc: Type.Optional(Type.String()),
  rules: Type.Array(IRuleValue),
  expression: ExpressionMathJSON,
  workflow: WorkFlow,
});
