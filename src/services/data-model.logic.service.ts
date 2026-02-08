// SPDX-License-Identifier: Apache-2.0
import type { TazamaField } from '@tazama-lf/tcs-lib';
import { loggerService } from '../index';
import * as DataModelRepository from '../repositories/configuration/data-model.repository';

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

interface Collection {
  name: string;
  type: string;
  collection_id: number;
  fields: TazamaField[];
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

export const handleGetAllCollections = async (tenantId: string): Promise<Collection[]> => {
  try {
    loggerService.log(`Getting all collections for tenant: ${tenantId}`);

    const collections = await DataModelRepository.getAllCollections(tenantId);

    const result = await Promise.all(
      collections.map(async (row: CollectionRow) => ({
        name: row.collection_name,
        type: row.collection_type,
        collection_id: row.destination_type_id,
        fields: await buildCollectionFields(row.destination_type_id, tenantId),
      })),
    );

    loggerService.log(`Successfully retrieved ${result.length} collections`);
    return result;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error getting collections: ${errorMessage.message}`, 'handleGetAllCollections');
    throw new Error(errorMessage.message);
  }
};

const buildCollectionFields = async (collectionId: number, tenantId: string): Promise<TazamaField[]> => {
  const fields = await DataModelRepository.getCollectionFields(collectionId, tenantId);

  // Build a map of field_id to child fields for object types
  const childFieldsMap = new Map<number, FieldRow[]>();

  for (const row of fields) {
    if (row.parent_id !== null) {
      if (!childFieldsMap.has(row.parent_id)) {
        childFieldsMap.set(row.parent_id, []);
      }
      childFieldsMap.get(row.parent_id)!.push(row);
    }
  }

  // Transform all fields to TazamaField format
  const tazamaFields: TazamaField[] = fields.map((field) => {
    const tazamaField: TazamaField = {
      name: field.field_name,
      type: field.field_type,
      required: false,
      parent_id: field.parent_id,
      serial_no: field.serial_no,
      collection_id: field.collection_id,
    };

    // If this is an object type field, add its properties
    if (field.field_type.toLowerCase() === 'object') {
      const childFields = childFieldsMap.get(field.field_id) ?? [];
      if (childFields.length > 0) {
        tazamaField.properties = childFields.map((nf) => ({
          name: nf.field_name,
          type: nf.field_type,
          required: false,
          parent_id: nf.parent_id,
          serial_no: nf.serial_no,
          collection_id: nf.collection_id,
        }));
      }
    }

    return tazamaField;
  });

  return tazamaFields;
};

export const handleCreateDestinationType = async (
  collectionType: string,
  name: string,
  destinationId: number,
  tenantId: string,
): Promise<DestinationTypeRow> => {
  try {
    loggerService.log(`Creating destination type: ${name} for tenant: ${tenantId}`);

    const result = await DataModelRepository.createDestinationType(collectionType, name, destinationId, tenantId);

    loggerService.log(`Successfully created destination type with ID: ${result.destination_type_id}`);
    return result;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error creating destination type: ${errorMessage.message}`, 'handleCreateDestinationType');
    throw new Error(errorMessage.message);
  }
};

export const handleDestinationTypeExists = async (destinationTypeId: number, tenantId: string): Promise<boolean> => {
  try {
    loggerService.log(`Checking if destination type ${destinationTypeId} exists for tenant: ${tenantId}`);

    const exists = await DataModelRepository.destinationTypeExists(destinationTypeId, tenantId);

    loggerService.log(`Destination type ${destinationTypeId} exists: ${exists}`);
    return exists;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error checking destination type: ${errorMessage.message}`, 'handleDestinationTypeExists');
    throw new Error(errorMessage.message);
  }
};

export const handleAddFieldToDestinationType = async (
  destinationTypeId: number,
  name: string,
  fieldType: string,
  parentId: number | null,
  serialNo: number | null,
  tenantId: string,
): Promise<FieldResultRow> => {
  try {
    loggerService.log(`Adding field ${name} to destination type ${destinationTypeId} for tenant: ${tenantId}`);

    // Check if destination type exists
    const exists = await DataModelRepository.destinationTypeExists(destinationTypeId, tenantId);
    if (!exists) {
      throw new Error(`Destination type with ID ${destinationTypeId} not found`);
    }

    // Get next serial number if not provided and no parent
    let finalSerialNo = serialNo;
    if (!finalSerialNo && !parentId) {
      finalSerialNo = await DataModelRepository.getNextSerialNumber(destinationTypeId);
    }

    const result = await DataModelRepository.addFieldToDestinationType({
      name,
      fieldType,
      parentId,
      tenantId,
      serialNo: finalSerialNo,
      collectionId: destinationTypeId,
    });

    loggerService.log(`Successfully added field with ID: ${result.field_id}`);
    return result;
  } catch (error) {
    const errorMessage = error as { message: string };
    loggerService.error(`Error adding field to destination type: ${errorMessage.message}`, 'handleAddFieldToDestinationType');
    throw new Error(errorMessage.message);
  }
};
