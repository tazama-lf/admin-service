// SPDX-License-Identifier: Apache-2.0
import { loggerService } from '..';
import type { TazamaField, CreateDestinationTypeBody, AddFieldBody, CollectionRow, FieldRow } from '@tazama-lf/tcs-lib';
import {
  getAllCollections,
  getCollectionFields,
  createDestinationType,
  checkDestinationTypeExists,
  addFieldToDestinationType,
} from '../repositories';

interface CollectionWithFields {
  name: string;
  type: string;
  collection_id: number;
  fields: TazamaField[];
}

export const handleGetAllCollections = async (tenantId: string): Promise<CollectionWithFields[]> => {
  try {
    loggerService.log(`Started handling get all collections request for tenant: ${tenantId}`);

    const collections = (await getAllCollections(tenantId)) as unknown as CollectionRow[];

    const collectionsWithFields = await Promise.all(
      collections.map(async (row) => ({
        name: row.collection_name,
        type: row.collection_type,
        collection_id: row.destination_type_id,
        fields: await buildCollectionFields(row.destination_type_id, tenantId),
      })),
    );

    loggerService.log(`Successfully retrieved ${collectionsWithFields.length} collections`);
    return collectionsWithFields;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error getting all collections: ${errorMessage}`, 'handleGetAllCollections');
    throw new Error(errorMessage);
  }
};

export const handleGetCollectionFields = async (collectionId: number, tenantId: string): Promise<TazamaField[]> => {
  try {
    loggerService.log(`Started handling get collection fields request for collection: ${collectionId}`);

    const fields = await buildCollectionFields(collectionId, tenantId);

    loggerService.log(`Successfully retrieved ${fields.length} fields for collection ${collectionId}`);
    return fields;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error getting collection fields: ${errorMessage}`, 'handleGetCollectionFields');
    throw new Error(errorMessage);
  }
};

const buildCollectionFields = async (collectionId: number, tenantId: string): Promise<TazamaField[]> => {
  const result = (await getCollectionFields(collectionId, tenantId)) as unknown as FieldRow[];

  const rootFields: FieldRow[] = [];
  const nestedFieldsMap = new Map<number, FieldRow[]>();

  for (const row of result) {
    if (row.parent_id === null) {
      rootFields.push(row);
    } else {
      if (!nestedFieldsMap.has(row.parent_id)) {
        nestedFieldsMap.set(row.parent_id, []);
      }
      nestedFieldsMap.get(row.parent_id)!.push(row);
    }
  }

  const fields: TazamaField[] = rootFields.map((rootField) => {
    const tazamaField: TazamaField = {
      name: rootField.field_name,
      type: rootField.field_type,
      required: false,
      parent_id: rootField.parent_id,
      serial_no: rootField.serial_no,
      collection_id: rootField.collection_id,
    };

    if (rootField.field_type === 'object') {
      const nestedFields = nestedFieldsMap.get(rootField.serial_no) ?? [];
      tazamaField.properties = nestedFields.map((nf) => ({
        name: nf.field_name,
        type: nf.field_type,
        required: false,
        parent_id: nf.parent_id,
        serial_no: nf.serial_no,
        collection_id: nf.collection_id,
      }));
    }

    return tazamaField;
  });

  return fields;
};

export const handleCreateDestinationType = async (
  body: CreateDestinationTypeBody,
  tenantId: string,
): Promise<{ destination_type_id: number }> => {
  try {
    const { collection_type: collectionType, name, destination_id: destinationId } = body;

    loggerService.log(`Started handling create destination type request for: ${name}`);

    const result = await createDestinationType(collectionType, name, destinationId, tenantId);

    loggerService.log(`Successfully created destination type with ID: ${result.destination_type_id}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error creating destination type: ${errorMessage}`, 'handleCreateDestinationType');
    throw new Error(errorMessage);
  }
};

export const handleDestinationTypeExists = async (destinationTypeId: number, tenantId: string): Promise<boolean> => {
  try {
    loggerService.log(`Checking if destination type ${destinationTypeId} exists for tenant: ${tenantId}`);

    const exists = await checkDestinationTypeExists(destinationTypeId, tenantId);

    loggerService.log(`Destination type ${destinationTypeId} exists: ${exists}`);
    return exists;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error checking destination type exists: ${errorMessage}`, 'handleDestinationTypeExists');
    throw new Error(errorMessage);
  }
};

export const handleAddFieldToDestinationType = async (
  destinationTypeId: number,
  body: AddFieldBody,
  tenantId: string,
): Promise<{ field_id: number }> => {
  try {
    loggerService.log(`Started handling add field to destination type ${destinationTypeId}`);

    const result = await addFieldToDestinationType(destinationTypeId, body, tenantId);

    loggerService.log(`Successfully added field with ID: ${result.field_id}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error adding field to destination type: ${errorMessage}`, 'handleAddFieldToDestinationType');
    throw new Error(errorMessage);
  }
};
