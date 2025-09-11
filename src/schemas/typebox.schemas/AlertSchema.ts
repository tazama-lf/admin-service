// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';
import { TADPResult } from './TADPResultSchema';
import { MetaData } from './MetaDataSchema';
import { Pacs002Schema } from './Pacs002Entity';
import { NetworkMapSchema } from './NetworkMapEntity';

export type AlertSchema = Static<typeof AlertSchema>;
export const AlertSchema = Type.Object({
  evaluationID: Type.String(),
  metaData: Type.Optional(MetaData),
  status: Type.String(),
  timestamp: Type.String(),
  tadpResult: TADPResult,
});

export type ReportSchema = Static<typeof ReportSchema>;
export const ReportSchema = Type.Object({
  transactionID: Type.String(),
  report: AlertSchema,
  transaction: Pacs002Schema,
  networkMap: NetworkMapSchema,
});
