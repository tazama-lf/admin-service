// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const GetReportSchema = Type.Object({
  msgid: Type.String(),
});

export type GetReport = Static<typeof GetReportSchema>;
