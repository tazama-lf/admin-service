// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export type TransactionRelationshipSchema = Static<typeof TransactionRelationshipSchema>;
export const TransactionRelationshipSchema = Type.Object({
  source: Type.String(),
  destination: Type.String(),
  transaction: Type.Object({
    TxTp: Type.String(),
    MsgId: Type.String(),
    CreDtTm: Type.String(),
    Amt: Type.Optional(Type.String()),
    Ccy: Type.Optional(Type.String()),
    EndToEndId: Type.String(),
    lat: Type.Optional(Type.String()),
    long: Type.Optional(Type.String()),
    TxSts: Type.Optional(Type.String()),
  }),
});
