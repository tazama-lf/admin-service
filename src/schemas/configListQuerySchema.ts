// SPDX-License-Identifier: Apache-2.0
import { Type } from '@sinclair/typebox';

// Per-entity querystring schemas for the configuration `list` endpoints (#418).
//
// These constrain `sort` to an allowlist of generated key columns and `filters`
// to a closed set of known fields. Combined with the production Ajv settings
// (removeAdditional: 'all'), an unknown `filters[...]` key is silently stripped
// (D1) while an out-of-range `sort`/`order` value is rejected with 400.

const Order = Type.Optional(
  Type.Union([Type.Literal('ASC'), Type.Literal('DESC')], {
    description: 'Sort direction applied to the ordering columns. Defaults to ASC when omitted.',
  }),
);
// `all` returns the full tenant-scoped set in one response (#422); it is mutually exclusive
// with a non-zero `offset`, which the list handler enforces as a 400 cross-field guard.
const Limit = Type.Optional(
  Type.Union([Type.Integer({ minimum: 1, maximum: 100 }), Type.Literal('all')], {
    description:
      "Page size: an integer between 1 and 100 (defaults to 20 when omitted), or the literal 'all' to return the full tenant-scoped set in a single response. 'all' is mutually exclusive with a non-zero offset (rejected with 400).",
  }),
);
const Offset = Type.Optional(
  Type.Integer({
    minimum: 0,
    description: 'Number of matching rows to skip for pagination. Defaults to 0; cannot be combined with limit=all.',
  }),
);

// Targeted batch fetch (#423): an optional set of (id, cfg) pairs matched in one query against the
// generated composite-key columns. A top-level param (not part of scalar `filters`); bounded by
// `maxItems` so an oversized request is rejected with 400 at the schema boundary. Supplied via the
// qs nested-array form `keys[0][id]=..&keys[0][cfg]=..`. Scoped to rule + typology (composite key);
// network_map (single (cfg) key) deliberately omits it, so the param is stripped (removeAdditional).
const Keys = Type.Optional(
  Type.Array(Type.Object({ id: Type.String(), cfg: Type.String() }, { additionalProperties: false }), {
    maxItems: 200,
    description:
      'Targeted batch fetch: a set of composite (id, cfg) pairs returned in a single query (maximum 200). Supplied via the nested-array form keys[0][id]=..&keys[0][cfg]=.. Supported on rule and typology only.',
  }),
);

export const RuleListQuery = Type.Object({
  limit: Limit,
  offset: Offset,
  order: Order,
  sort: Type.Optional(
    Type.Union([Type.Literal('id'), Type.Literal('cfg')], {
      description:
        "Lead ordering column (defaults to 'id'). The remaining unique-key column is always appended so paging is deterministic.",
    }),
  ),
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
  sort: Type.Optional(
    Type.Union([Type.Literal('id'), Type.Literal('cfg')], {
      description:
        "Lead ordering column (defaults to 'id'). The remaining unique-key column is always appended so paging is deterministic.",
    }),
  ),
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
  sort: Type.Optional(Type.Literal('cfg', { description: "Only sortable key for network maps; 'cfg' is the unique key." })),
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
