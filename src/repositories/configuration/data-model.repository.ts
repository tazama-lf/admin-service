// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

interface CollectionRow {
  collection_name: string;
  collection_type: string;
  destination_type_id: number;
  destination_id: number;
}

interface FieldRow {
  field_id: number;
  field_name: string;
  field_type: string;
  parent_id: number | null;
  serial_no: number;
  collection_id: number;
  tenant_id: string;
}

interface DestinationTypeRow {
  destination_type_id: number;
  collection_type: string;
  name: string;
  destination_id: number;
  tenant_id: string;
  created_at: string;
}

interface FieldResultRow {
  field_id: number;
  field_name: string;
  field_type: string;
  parent_id: number | null;
  tenant_id: string;
  serial_no: number | null;
  collection_id: number;
}

interface NextSerialRow {
  next_serial: number;
}

export const getAllCollections = async (tenantId: string): Promise<CollectionRow[]> => {
  const query = `
    SELECT 
      dt.name as collection_name,
      dt.collection_type,
      dt.destination_type_id as destination_type_id,
      dt.destination_id as destination_id
    FROM destination_type dt
    LEFT JOIN destination d ON d.destination_id = dt.destination_id
    WHERE LOWER(dt.tenant_id) = LOWER($1) OR LOWER(dt.tenant_id) = 'default'
    ORDER BY dt.name
  `;

  const result = await handlePostExecuteSqlStatement<CollectionRow>(
    { text: query, values: [tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows;
};

export const getCollectionFields = async (collectionId: number, tenantId: string): Promise<FieldRow[]> => {
  const query = `
    SELECT 
      dtf.field_id,
      dtf.name as field_name,
      dtf.field_type,
      dtf.parent_id,
      dtf.serial_no,
      dtf.collection_id,
      dtf.tenant_id
    FROM destination_type_fields dtf
    WHERE dtf.collection_id = $1 AND (LOWER(dtf.tenant_id) = LOWER($2) OR LOWER(dtf.tenant_id) = 'default')
    ORDER BY dtf.serial_no, dtf.field_id
  `;

  const result = await handlePostExecuteSqlStatement<FieldRow>(
    { text: query, values: [collectionId, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows;
};

export const createDestinationType = async (
  collectionType: string,
  name: string,
  destinationId: number,
  tenantId: string,
): Promise<DestinationTypeRow> => {
  const query = `
    INSERT INTO destination_type (collection_type, name, destination_id, tenant_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING destination_type_id, collection_type, name, destination_id, tenant_id, created_at
  `;

  const result = await handlePostExecuteSqlStatement<DestinationTypeRow>(
    { text: query, values: [collectionType, name, destinationId, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create destination type');
  }

  return result.rows[0];
};

export const destinationTypeExists = async (destinationTypeId: number, tenantId: string): Promise<boolean> => {
  const query =
    "SELECT destination_type_id FROM destination_type WHERE destination_type_id = $1 AND (LOWER(tenant_id) = LOWER($2) OR LOWER(tenant_id) = 'default')";

  const result = await handlePostExecuteSqlStatement<{ destination_type_id: number }>(
    { text: query, values: [destinationTypeId, tenantId] } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows.length > 0;
};

export const getNextSerialNumber = async (destinationTypeId: number): Promise<number> => {
  const query = `
    SELECT COALESCE(MAX(serial_no), 0) + 1 as next_serial
    FROM destination_type_fields
    WHERE collection_id = $1 AND parent_id IS NULL
  `;

  const result = await handlePostExecuteSqlStatement<NextSerialRow>(
    { text: query, values: [destinationTypeId] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to get next serial number');
  }

  return result.rows[0].next_serial;
};

export const addFieldToDestinationType = async (
  name: string,
  fieldType: string,
  parentId: number | null,
  tenantId: string,
  serialNo: number | null,
  collectionId: number,
): Promise<FieldResultRow> => {
  const query = `
    INSERT INTO destination_type_fields (name, field_type, parent_id, tenant_id, serial_no, collection_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING field_id, name as field_name, field_type, parent_id, tenant_id, serial_no, collection_id
  `;

  const result = await handlePostExecuteSqlStatement<FieldResultRow>(
    { text: query, values: [name, fieldType, parentId, tenantId, serialNo, collectionId] } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to add field to destination type');
  }

  return result.rows[0];
};
