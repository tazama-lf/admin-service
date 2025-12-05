// SPDX-License-Identifier: Apache-2.0
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {
  TazamaField,
  GetCollectionsParams,
  CreateDestinationTypeBody,
  AddFieldBody,
  DestinationTypeParams,
  CollectionRow,
  FieldRow,
  DestinationTypeResult,
  FieldResult,
} from '@tazama-lf/tcs-lib';
import { databaseService } from '../index';

export async function getAllCollectionsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { tenantId } = request.params as GetCollectionsParams;
    const result = (await databaseService.getAllCollections(tenantId || 'default')) as CollectionRow[];

    const collectionsPromises = result.map(async (row) => {
      const fields = await getCollectionFields(row.destination_type_id);

      return {
        name: row.collection_name,
        type: row.collection_type,
        description: row.collection_description,
        collection_id: row.destination_type_id,
        fields,
      };
    });

    const collections = await Promise.all(collectionsPromises);

    await reply.status(200).send({
      success: true,
      data: collections,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    request.log.error(`Failed to get collections: ${errorMessage}`);
    await reply.status(500).send({
      success: false,
      error: errorMessage,
      data: [],
    });
  }
}

async function getCollectionFields(collectionId: number): Promise<TazamaField[]> {
  const result = (await databaseService.getCollectionFields(collectionId)) as FieldRow[];

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

  const fields: TazamaField[] = [];

  for (const rootField of rootFields) {
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

    fields.push(tazamaField);
  }

  return fields;
}

export async function createDestinationTypeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { collection_type: collectionType, name, description, destination_id: destinationId } = request.body as CreateDestinationTypeBody;

    const result = (await databaseService.createDestinationType(
      collectionType,
      name,
      description ?? null,
      destinationId,
    )) as DestinationTypeResult;

    await reply.status(201).send({
      success: true,
      message: 'Destination type created successfully',
      data: result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    request.log.error(`Failed to create destination type: ${errorMessage}`);
    await reply.status(500).send({
      success: false,
      message: errorMessage,
      data: null,
    });
  }
}

export async function destinationTypeExistsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { destinationTypeId } = request.params as DestinationTypeParams;
    const destinationTypeIdNum = Number.parseInt(destinationTypeId, 10);
    const exists = await databaseService.destinationTypeExists(destinationTypeIdNum);

    await reply.status(200).send({
      success: true,
      exists,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    request.log.error(`Failed to check destination type: ${errorMessage}`);
    await reply.status(500).send({
      success: false,
      error: errorMessage,
    });
  }
}
export async function addFieldToDestinationTypeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const { destinationTypeId } = request.params as DestinationTypeParams;
    const destinationTypeIdNum = Number.parseInt(destinationTypeId, 10);
    const { name, field_type: fieldType, parent_id: parentId, is_active: isActive, serial_no: serialNo } = request.body as AddFieldBody;

    const exists = await databaseService.destinationTypeExists(destinationTypeIdNum);

    if (!exists) {
      await reply.status(404).send({
        success: false,
        message: `Destination type with ID ${destinationTypeIdNum} not found`,
        data: null,
      });
      return;
    }

    let finalSerialNo = serialNo;
    if (!finalSerialNo && !parentId) {
      finalSerialNo = await databaseService.getNextSerialNumber(destinationTypeIdNum);
    }

    const result = (await databaseService.addFieldToDestinationType(
      name,
      fieldType,
      parentId ?? null,
      isActive ?? true,
      finalSerialNo ?? null,
      destinationTypeIdNum,
    )) as FieldResult;

    await reply.status(201).send({
      success: true,
      message: 'Field added successfully',
      data: result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    request.log.error(`Failed to add field: ${errorMessage}`);
    await reply.status(500).send({
      success: false,
      message: errorMessage,
      data: null,
    });
  }
}
