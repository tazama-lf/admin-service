// SPDX-License-Identifier: Apache-2.0
import { loggerService } from '..';
import { getDataModelJson, upsertDataModelJson } from '../repositories';

export const handleGetDataModelJson = async (tenantId: string): Promise<Record<string, unknown> | null> => {
  try {
    loggerService.log(`Started handling get data model JSON for tenant: ${tenantId}`);

    const dataModelJson = await getDataModelJson(tenantId);

    loggerService.log(`Successfully retrieved data model JSON for tenant: ${tenantId}`);
    return dataModelJson;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error getting data model JSON: ${errorMessage}`, 'handleGetDataModelJson');
    throw new Error(errorMessage);
  }
};

export const handleUpsertDataModelJson = async (
  tenantId: string,
  dataModelJson: Record<string, unknown>,
): Promise<{ tenant_id: string; updated_at: string }> => {
  try {
    loggerService.log(`Started handling upsert data model JSON for tenant: ${tenantId}`);

    const result = await upsertDataModelJson(tenantId, dataModelJson);

    loggerService.log(`Successfully upserted data model JSON for tenant: ${tenantId}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    loggerService.error(`Error upserting data model JSON: ${errorMessage}`, 'handleUpsertDataModelJson');
    throw new Error(errorMessage);
  }
};
