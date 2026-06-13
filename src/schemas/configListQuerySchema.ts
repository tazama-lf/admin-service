// SPDX-License-Identifier: Apache-2.0
import { Type } from '@sinclair/typebox';

// Per-entity querystring schemas for the configuration `list` endpoints (#418).
//
// These constrain `sort` to an allowlist of generated key columns and `filters`
// to a closed set of known fields. Combined with the production Ajv settings
// (removeAdditional: 'all'), an unknown `filters[...]` key is silently stripped
// (D1) while an out-of-range `sort`/`order` value is rejected with 400.

const Order = Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')]));
const Limit = Type.Optional(Type.Integer({ minimum: 1, maximum: 100 }));
const Offset = Type.Optional(Type.Integer({ minimum: 0 }));

export const RuleListQuery = Type.Object({
  limit: Limit,
  offset: Offset,
  order: Order,
  sort: Type.Optional(Type.Union([Type.Literal('id'), Type.Literal('cfg')])),
  filters: Type.Optional(
    Type.Object(
      {
        id: Type.Optional(Type.String()),
        cfg: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
  ),
});

export const TypologyListQuery = Type.Object({
  limit: Limit,
  offset: Offset,
  order: Order,
  sort: Type.Optional(Type.Union([Type.Literal('id'), Type.Literal('cfg')])),
  filters: Type.Optional(
    Type.Object(
      {
        id: Type.Optional(Type.String()),
        cfg: Type.Optional(Type.String()),
      },
      { additionalProperties: false },
    ),
  ),
});

export const NetworkMapListQuery = Type.Object({
  limit: Limit,
  offset: Offset,
  order: Order,
  sort: Type.Optional(Type.Literal('cfg')),
  filters: Type.Optional(
    Type.Object(
      {
        cfg: Type.Optional(Type.String()),
        // `active` maps to a generated boolean column cast `::boolean`; constrain it to
        // the two valid literals so a malformed value is rejected with 400 at the schema
        // boundary rather than raising a Postgres cast error (500).
        active: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
      },
      { additionalProperties: false },
    ),
  ),
});
