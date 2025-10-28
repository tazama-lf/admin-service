// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

const ExpressionMathJSON = Type.String();

const Weight = Type.Object({
  ref: Type.String(),
  wght: Type.Number(),
});

const RuleValue = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  wghts: Type.Array(Weight),
  termId: Type.String(),
});

const WorkFlow = Type.Object({
  alertThreshold: Type.Number(),
  interdictionThreshold: Type.Optional(Type.Number()),
  flowProcessor: Type.Optional(Type.String()),
});

// Final top-level schema — fully inline except for the recursive array
export const TypologySchema = Type.Object(
  {
    id: Type.String(),
    cfg: Type.String(),
    desc: Type.Optional(Type.String()),
    rules: Type.Array(RuleValue),
    expression: Type.Array(ExpressionMathJSON),
    workflow: WorkFlow,
  },
  { additionalProperties: true },
);
export type Typology = Static<typeof TypologySchema>;
