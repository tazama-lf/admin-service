// SPDX-License-Identifier: Apache-2.0
import { Type, type Static } from '@sinclair/typebox';

export type Rule = Static<typeof RuleSchema>;
export const RuleSchema = Type.Object({
  id: Type.String(),
  cfg: Type.String(),
  host: Type.Optional(Type.String()),
});

export type Typology = Static<typeof TypologySchema>;
export const TypologySchema = Type.Object(
  {
    id: Type.String(),
    host: Type.Optional(Type.String()),
    cfg: Type.String(),
    desc: Type.Optional(Type.String()),
    rules: Type.Array(RuleSchema),
  },
  { additionalProperties: true },
);

export type Message = Static<typeof MessageSchema>;
export const MessageSchema = Type.Object({
  id: Type.String(),
  host: Type.Optional(Type.String()),
  cfg: Type.String(),
  txTp: Type.String(),
  typologies: Type.Array(TypologySchema),
});

export type NetworkMap = Static<typeof NetworkMapSchema>;
export const NetworkMapSchema = Type.Object(
  {
    active: Type.Boolean(),
    cfg: Type.String(),
    messages: Type.Array(MessageSchema),
  },
  { additionalProperties: true },
);
