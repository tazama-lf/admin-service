// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';
import { TypologyResult } from './TypologyResultSchema';

export type TADPResult = Static<typeof TADPResult>;
export const TADPResult = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  typologyResult: Type.Array(TypologyResult),
});
