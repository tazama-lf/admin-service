// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';
import { DataCache } from './DataCache';

export type Pacs002Schema = Static<typeof Pacs002Schema>;

type GrpHdr = Static<typeof GrpHdr>;
const GrpHdr = Type.Object({
  MsgId: Type.String(),
  CreDtTm: Type.String(),
});

type CLRSysMmbID = Static<typeof CLRSysMmbID>;
const CLRSysMmbID = Type.Object({
  MmbId: Type.String(),
});

type FinInstnID = Static<typeof FinInstnID>;
const FinInstnID = Type.Object({
  ClrSysMmbId: CLRSysMmbID,
});

type Agt = Static<typeof Agt>;
const Agt = Type.Object({
  FinInstnId: FinInstnID,
});

type Amt = Static<typeof Amt>;
const Amt = Type.Object({
  Amt: Type.Number(),
  Ccy: Type.String(),
});

type ChrgsInf = Static<typeof ChrgsInf>;
const ChrgsInf = Type.Object({
  Amt,
  Agt,
});

type TxInfAndSts = Static<typeof TxInfAndSts>;
const TxInfAndSts = Type.Object({
  OrgnlInstrId: Type.String(),
  OrgnlEndToEndId: Type.String(),
  TxSts: Type.String(),
  ChrgsInf: Type.Array(ChrgsInf),
  AccptncDtTm: Type.String(),
  InstgAgt: Agt,
  InstdAgt: Agt,
});

type FIToFIPmtSts = Static<typeof FIToFIPmtSts>;
const FIToFIPmtSts = Type.Object({
  GrpHdr,
  TxInfAndSts,
});

export const Pacs002Schema = Type.Object({
  TxTp: Type.String(),
  FIToFIPmtSts,
  DataCache: Type.Optional(DataCache),
});
