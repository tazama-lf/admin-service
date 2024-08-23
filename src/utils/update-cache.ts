import { createConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import type { ConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import { databaseManager, loggerService } from '..';
import { configuration } from '../config';

export const updateCache = async (key: string, payload: ConditionResponse): Promise<void> => {
  const buf = createConditionsBuffer(payload);
  if (!buf) {
    loggerService.error('payload cannot be serialised into buffer', 'cache', key);
  } else {
    await databaseManager.set(key, buf, configuration.cacheTTL);
  }
};
