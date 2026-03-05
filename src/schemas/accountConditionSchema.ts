// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const AccountConditionSchema = Type.Object(
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

    acct: Type.Object({
      id: Type.String({ minLength: 1 }),
      schmeNm: Type.Object({
        prtry: Type.String({ minLength: 1 }),
      }),
      agt: Type.Object({
        finInstnId: Type.Object({
          clrSysMmbId: Type.Object({
            mmbId: Type.String({ minLength: 1 }),
          }),
        }),
      }),
    }),

    forceCret: Type.Boolean(),
    usr: Type.String({ minLength: 1 }),
  },
  {
    description: 'Account condition typebox schema for fastify validation',
  },
);

export type AccountCondition = Static<typeof AccountConditionSchema>;
