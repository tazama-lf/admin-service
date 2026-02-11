import { findActiveNetworkMapInDb } from '../repositories/configuration/network.map.repository';

export const findActiveNetworkMap = async (tenantId: string): Promise<unknown> => {
  const result = await findActiveNetworkMapInDb(tenantId);
  return result ? result.configuration : null;
};
