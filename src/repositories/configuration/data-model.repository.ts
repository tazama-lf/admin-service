// SPDX-License-Identifier: Apache-2.0
import type { PgQueryConfig } from '@tazama-lf/frms-coe-lib';
import type { AddFieldBody } from '@tazama-lf/tcs-lib';
import { handlePostExecuteSqlStatement } from '../../services/database.logic.service';

export const getAllCollections = async (tenantId: string): Promise<Array<Record<string, unknown>>> => {
  const query = `
    SELECT 
      dt.name as collection_name,
      dt.collection_type,
      dt.destination_type_id as destination_type_id,
      dt.destination_id as destination_id
    FROM tcs_destination_type dt
    LEFT JOIN tcs_destination d ON d.destination_id = dt.destination_id
    WHERE LOWER(dt.tenant_id) = LOWER($1) OR LOWER(dt.tenant_id) = 'default'
    ORDER BY dt.name
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows;
};

export const getCollectionFields = async (collectionId: number, tenantId: string): Promise<Array<Record<string, unknown>>> => {
  const query = `
    SELECT 
      dtf.field_id,
      dtf.name as field_name,
      dtf.field_type,
      dtf.parent_id,
      dtf.serial_no,
      dtf.collection_id,
      dtf.tenant_id
    FROM tcs_destination_type_fields dtf
    WHERE dtf.collection_id = $1 AND (LOWER(dtf.tenant_id) = LOWER($2) OR LOWER(dtf.tenant_id) = 'default')
    ORDER BY dtf.serial_no, dtf.field_id
  `;

  const result = await handlePostExecuteSqlStatement<Record<string, unknown>>(
    {
      text: query,
      values: [collectionId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return result.rows;
};

export const createDestinationType = async (
  collectionType: string,
  name: string,
  destinationId: number,
  tenantId: string,
): Promise<{ destination_type_id: number }> => {
  const query = `
    INSERT INTO tcs_destination_type (collection_type, name, destination_id, tenant_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING destination_type_id
  `;

  const result = await handlePostExecuteSqlStatement<{ destination_type_id: number }>(
    {
      text: query,
      values: [collectionType, name, destinationId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to create destination type - no ID returned');
  }

  return result.rows[0];
};

export const checkDestinationTypeExists = async (destinationTypeId: number, tenantId: string): Promise<boolean> => {
  const query = `
    SELECT COUNT(*) as count 
    FROM tcs_destination_type 
    WHERE destination_type_id = $1 
    AND (LOWER(tenant_id) = LOWER($2) OR LOWER(tenant_id) = 'default')
  `;

  const result = await handlePostExecuteSqlStatement<{ count: string }>(
    {
      text: query,
      values: [destinationTypeId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  return parseInt(result.rows[0].count, 10) > 0;
};

export const addFieldToDestinationType = async (
  destinationTypeId: number,
  body: AddFieldBody,
  tenantId: string,
): Promise<{ field_id: number }> => {
  const { name, field_type: fieldType, parent_id: parentId, serial_no: serialNo } = body;

  const sanitizedParentId = !parentId || (parentId as unknown) === '' ? null : parentId;
  const sanitizedSerialNo = !serialNo || (serialNo as unknown) === '' ? 0 : serialNo;

  const query = `
    INSERT INTO tcs_destination_type_fields (name, field_type, parent_id, serial_no, collection_id, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING field_id
  `;

  const result = await handlePostExecuteSqlStatement<{ field_id: number }>(
    {
      text: query,
      values: [name, fieldType, sanitizedParentId, sanitizedSerialNo, destinationTypeId, tenantId],
    } satisfies PgQueryConfig,
    'configuration',
  );

  if (result.rows.length === 0) {
    throw new Error('Failed to add field to destination type - no ID returned');
  }

  return result.rows[0];
};
