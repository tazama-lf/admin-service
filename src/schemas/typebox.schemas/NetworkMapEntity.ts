// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export type Rule = Static<typeof Rule>;
export const Rule = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  host: Type.Optional(Type.String()),
});

export type Typology = Static<typeof Typology>;
export const Typology = Type.Object({
  id: Type.String(),
  host: Type.Optional(Type.String()),
  cfg: Type.String(),
  desc: Type.Optional(Type.String()),
  rules: Type.Array(Rule),
});

export type Message = Static<typeof Message>;
export const Message = Type.Object({
  id: Type.String(),
  host: Type.Optional(Type.String()),
  cfg: Type.String(),
  txTp: Type.String(),
  typologies: Type.Array(Typology),
});

export type NetworkMapSchema = Static<typeof NetworkMapSchema>;
export const NetworkMapSchema = Type.Object({
  active: Type.Boolean(),
  cfg: Type.String(),
  tenantId: Type.Optional(Type.String({ default: 'DEFAULT' })),
  messages: Type.Array(Message),
});
