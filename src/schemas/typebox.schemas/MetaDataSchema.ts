// SPDX-License-Identifier: Apache-2.0

import { Type, type Static } from '@sinclair/typebox';

export type MetaData = Static<typeof MetaData>;
export const MetaData = Type.Object({
  traceParent: Type.Optional(Type.String()),
});
