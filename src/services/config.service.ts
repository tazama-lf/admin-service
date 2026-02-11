import {
  findAllTransactionTypesFromDb,
  findJsonPayloadByTransactionType,
  findXmlPayloadByTransactionType,
  getSchemaByTransactionTypeFromDb,
} from '../repositories/configuration/config.repository';
import { HttpException, HttpStatus } from '../utils/error';

export async function findAllTransactionTypes(tenantId: string): Promise<string[]> {
  return await findAllTransactionTypesFromDb(tenantId);
}

export async function getPayloadByTransactionType(transactionType: string, tenantId: string): Promise<unknown> {
  if (!transactionType || !tenantId) {
    throw new HttpException('Transaction type and tenant ID are required', HttpStatus.BAD_REQUEST);
  }

  try {
    let result = await findJsonPayloadByTransactionType(transactionType, tenantId);
    if (result) {
      result = await findXmlPayloadByTransactionType(transactionType, tenantId);
      return { payload: result, type: 'xml' };
    }
    return { payload: result, type: 'json' };
  } catch (error) {
    const err = error as Error;
    throw new HttpException(`Failed to fetch config payload: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR, {
      cause: error,
    });
  }
}

export async function getSchemaByTransactionType(
  transactionType: string,
  tenantId: string,
): Promise<{ schema: unknown; mapping: unknown }> {
  if (!transactionType || !tenantId) {
    throw new HttpException('Transaction type and tenant ID are required', HttpStatus.BAD_REQUEST);
  }

  try {
    return await getSchemaByTransactionTypeFromDb(transactionType, tenantId);
  } catch (error) {
    const err = error as Error;
    throw new HttpException(`Failed to fetch config schema: ${err.message}`, HttpStatus.INTERNAL_SERVER_ERROR, {
      cause: error,
    });
  }
}
