// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';
import { TADPResult } from './TADPResultSchema';
import { MetaData } from './MetaDataSchema';

export type AlertSchema = Static<typeof AlertSchema>;
export const AlertSchema = Type.Object({
  evaluationID: Type.String(),
  metaData: Type.Optional(MetaData),
  status: Type.String(),
  timestamp: Type.String(),
  tadpResult: TADPResult,
});
