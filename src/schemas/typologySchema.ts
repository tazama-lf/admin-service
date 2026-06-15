// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

// Mirrors @tazama-lf/frms-coe-lib's TypologyConfig.expression:
//   type ExpressionMathJSON = Array<string | number | ExpressionMathJSON>
// Modelled as a non-recursive array of unconstrained items rather than Type.Recursive. A recursive
// TypeBox schema makes @fastify/swagger emit a self-$ref (`#/components/schemas/def-0`) that it does
// not hoist into components/schemas, leaving a dangling pointer that breaks the Swagger UI for every
// typology endpoint. An unconstrained item schema serialises and validates the nested
// string/number/array shape correctly (fast-json-stringify and Ajv treat `{}` items as pass-through)
// while emitting no $ref, so the generated OpenAPI document resolves cleanly.
const ExpressionMathJSON = Type.Array(Type.Unknown());

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

// Final top-level schema - fully inline
export const TypologySchema = Type.Object(
  {
    id: Type.String(),
    cfg: Type.String(),
    desc: Type.Optional(Type.String()),
    rules: Type.Array(RuleValue),
    expression: ExpressionMathJSON,
    workflow: WorkFlow,
    creDtTm: Type.Optional(Type.String({ format: 'date-time' })),
    updDtTm: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { additionalProperties: true },
);
export type Typology = Static<typeof TypologySchema>;
