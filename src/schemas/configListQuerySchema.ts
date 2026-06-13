// SPDX-License-Identifier: Apache-2.0
import { Type } from '@sinclair/typebox';

// Per-entity querystring schemas for the configuration `list` endpoints (#418).
//
// These constrain `sort` to an allowlist of generated key columns and `filters`
// to a closed set of known fields. Combined with the production Ajv settings
// (removeAdditional: 'all'), an unknown `filters[...]` key is silently stripped
// (D1) while an out-of-range `sort`/`order` value is rejected with 400.

const Order = Type.Optional(Type.Union([Type.Literal('ASC'), Type.Literal('DESC')]));
// `all` returns the full tenant-scoped set in one response (#422); it is mutually exclusive
// with a non-zero `offset`, which the list handler enforces as a 400 cross-field guard.
const Limit = Type.Optional(Type.Union([Type.Integer({ minimum: 1, maximum: 100 }), Type.Literal('all')]));
const Offset = Type.Optional(Type.Integer({ minimum: 0 }));

// Targeted batch fetch (#423): an optional set of (id, cfg) pairs matched in one query against the
// generated composite-key columns. A top-level param (not part of scalar `filters`); bounded by
// `maxItems` so an oversized request is rejected with 400 at the schema boundary. Supplied via the
// qs nested-array form `keys[0][id]=..&keys[0][cfg]=..`. Scoped to rule + typology (composite key);
// network_map (single (cfg) key) deliberately omits it, so the param is stripped (removeAdditional).
const Keys = Type.Optional(
  Type.Array(Type.Object({ id: Type.String(), cfg: Type.String() }, { additionalProperties: false }), { maxItems: 200 }),
);

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
  keys: Keys,
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
  keys: Keys,
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
