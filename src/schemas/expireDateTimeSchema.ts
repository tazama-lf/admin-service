// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export const ExpireDateTimeSchema = Type.Object({
  xprtnDtTm: Type.Optional(Type.String()),
});

export type ExpireDateTime = Static<typeof ExpireDateTimeSchema>;
