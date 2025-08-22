import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { Edge } from '@tazama-lf/frms-coe-lib/lib/interfaces';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';
import type { Connector, CrudRepository } from '../repository.base';

//npx ts2typebox -i "node_modules\@tazama-lf\frms-coe-lib\lib\interfaces\Pacs002.d.ts" -o "src\schemas\Pacs002Entity.ts"

export const GovernedAsCreditorAccountByRepo: CrudRepository<Edge, Connector> = {
  list: async function ({ limit, offset }): Promise<{ data: Edge[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_creditor_account_by OFFSET $1 LIMIT $2',
        values: [offset, limit],
      },
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.edge), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function ({ source, destination }): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_creditor_account_by WHERE source = $1 AND destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].edge : null;
  },
  create: async function (payload: Edge): Promise<Edge> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'INSERT INTO governed_as_creditor_account_by (source, destination, evttp, incptndttm, xprtndttm) VALUES ($1,$2,$3,$4,$5) RETURNING evaluation',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].edge;
  },
  update: async function ({ source, destination }, payload: Edge): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'UPDATE governed_as_creditor_account_by SET source = $1, destination = $2, evttp = $3, incptndttm = $4, xprtndttm = $5 WHERE source = $6 AND destination = $7',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm, source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].edge : null;
  },
  remove: async function ({ source, destination }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'DELETE FROM governed_as_creditor_account_by WHERE source = $1 AND destination = $2',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};

export const GovernedAsCreditorByRepo: CrudRepository<Edge, Connector> = {
  list: async function ({ limit, offset }): Promise<{ data: Edge[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_creditor_by OFFSET $1 LIMIT $2',
        values: [offset, limit],
      },
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.edge), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function ({ source, destination }): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_creditor_by WHERE source = $1 AND destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].edge : null;
  },
  create: async function (payload: Edge): Promise<Edge> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'INSERT INTO governed_as_creditor_by (source, destination, evttp, incptndttm, xprtndttm) VALUES ($1,$2,$3,$4,$5) RETURNING evaluation',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].edge;
  },
  update: async function ({ source, destination }, payload: Edge): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'UPDATE governed_as_creditor_by SET source = $1, destination = $2, evttp = $3, incptndttm = $4, xprtndttm = $5 WHERE source = $6 AND destination = $7',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm, source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].edge : null;
  },
  remove: async function ({ source, destination }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'DELETE FROM governed_as_creditor_by WHERE source = $1 AND destination = $2',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};

export const GovernedAsDebtorAccountByRepo: CrudRepository<Edge, Connector> = {
  list: async function ({ limit, offset }): Promise<{ data: Edge[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_debtor_account_by OFFSET $1 LIMIT $2',
        values: [offset, limit],
      },
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.edge), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function ({ source, destination }): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_debtor_account_by WHERE source = $1 AND destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].edge : null;
  },
  create: async function (payload: Edge): Promise<Edge> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'INSERT INTO governed_as_debtor_account_by (source, destination, evttp, incptndttm, xprtndttm) VALUES ($1,$2,$3,$4,$5) RETURNING evaluation',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].edge;
  },
  update: async function ({ source, destination }, payload: Edge): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'UPDATE governed_as_debtor_account_by SET source = $1, destination = $2, evttp = $3, incptndttm = $4, xprtndttm = $5 WHERE source = $6 AND destination = $7',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm, source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].edge : null;
  },
  remove: async function ({ source, destination }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'DELETE FROM governed_as_debtor_account_by WHERE source = $1 AND destination = $2',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? true : false;
  },
};

export const GovernedAsDebtorByRepo: CrudRepository<Edge, Connector> = {
  list: async function ({ limit, offset }): Promise<{ data: Edge[]; total: number }> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_debtor_by OFFSET $1 LIMIT $2',
        values: [offset, limit],
      },
      'event_history',
    );

    return queryRes.rows.length > 0
      ? { data: queryRes.rows.map((values) => values.edge), total: queryRes.rowCount! }
      : { data: [], total: 0 };
  },
  get: async function ({ source, destination }): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'SELECT * FROM governed_as_debtor_by WHERE source = $1 AND destination = $2;',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );

    return queryRes.rows.length > 0 ? queryRes.rows[0].edge : null;
  },
  create: async function (payload: Edge): Promise<Edge> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'INSERT INTO governed_as_debtor_by (source, destination, evttp, incptndttm, xprtndttm) VALUES ($1,$2,$3,$4,$5) RETURNING evaluation',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rows[0].edge;
  },
  update: async function ({ source, destination }, payload: Edge): Promise<Edge | null> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'UPDATE governed_as_debtor_by SET source = $1, destination = $2, evttp = $3, incptndttm = $4, xprtndttm = $5 WHERE source = $6 AND destination = $7',
        values: [payload.source, payload.destination, payload.evtTp, payload.incptnDtTm, payload.xprtnDtTm, source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rows[0].edge : null;
  },
  remove: async function ({ source, destination }): Promise<boolean> {
    const queryRes = await handlePostExecuteSqlStatement<{ edge: Edge }>(
      {
        text: 'DELETE FROM governed_as_debtor_by WHERE source = $1 AND destination = $2',
        values: [source, destination],
      } satisfies PgQueryConfig,
      'event_history',
    );
    return queryRes.rowCount ? queryRes.rowCount > 0 : false;
  },
};
