// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';

export type OutcomeResult = Static<typeof OutcomeResult>;
export const OutcomeResult = Type.Object({
  subRuleRef: Type.String(),
  reason: Type.String(),
});

export type Band = Static<typeof Band>;
export const Band = Type.Composite([
  OutcomeResult,
  Type.Object({
    lowerLimit: Type.Optional(Type.Number()),
    upperLimit: Type.Optional(Type.Number()),
  }),
]);

export type Case = Static<typeof Case>;
export const Case = Type.Composite([
  OutcomeResult,
  Type.Object({
    value: Type.String(),
  }),
]);

export type Config = Static<typeof Config>;
export const Config = Type.Object({
  parameters: Type.Optional(Type.Record(Type.Optional(Type.Union([Type.String(), Type.Number()])), Type.Optional(Type.Unknown()))),
  exitConditions: Type.Optional(Type.Array(OutcomeResult)),
  bands: Type.Optional(Type.Array(Band)),
  cases: Type.Optional(Type.Array(Case)),
});

export type Rule = Static<typeof RuleSchema>;
export const RuleSchema = Type.Object(
  {
    id: Type.String(),
    cfg: Type.String(),
    config: Config,
    desc: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);
