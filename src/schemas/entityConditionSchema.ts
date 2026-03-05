// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const EntityConditionSchema = Type.Object(
  {
    evtTp: Type.Array(
      Type.Union([
        Type.Literal('pacs.008.001.10'),
        Type.Literal('pacs.002.001.12'),
        Type.Literal('pain.013.001.09'),
        Type.Literal('pain.001.001.11'),
        Type.Literal('all'),
      ]),
      { minItems: 1, uniqueItems: true },
    ),
    condTp: Type.String({
      minLength: 1,
      enum: ['overridable-block', 'non-overridable-block', 'override'],
    }),
    prsptv: Type.String({
      minLength: 1,
      enum: ['creditor', 'debtor', 'both'],
    }),
    incptnDtTm: Type.Optional(Type.String({ minLength: 1 })),
    xprtnDtTm: Type.Optional(Type.String({ minLength: 1 })),
    condRsn: Type.String({ minLength: 1 }),
    ntty: Type.Object({
      id: Type.String({ minLength: 1 }),
      schmeNm: Type.Object({
        prtry: Type.String({ minLength: 1 }),
      }),
    }),
    forceCret: Type.Boolean(),
    usr: Type.String({ minLength: 1 }),
  },
  {
    description: 'Entity condition typebox schema for fastify validation',
  },
);

export type EntityCondition = Static<typeof EntityConditionSchema>;
