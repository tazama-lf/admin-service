// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';

export type DataCache = Static<typeof DataCache>;
export const DataCache = Type.Object({
  dbtrId: Type.Optional(Type.String()),
  cdtrId: Type.Optional(Type.String()),
  dbtrAcctId: Type.Optional(Type.String()),
  cdtrAcctId: Type.Optional(Type.String()),
  evtId: Type.Optional(Type.String()),
  creDtTm: Type.Optional(Type.String()),
  instdAmt: Type.Optional(
    Type.Object({
      amt: Type.Number(),
      ccy: Type.String(),
    }),
  ),
  intrBkSttlmAmt: Type.Optional(
    Type.Object({
      amt: Type.Number(),
      ccy: Type.String(),
    }),
  ),
  xchgRate: Type.Optional(Type.Number()),
});
