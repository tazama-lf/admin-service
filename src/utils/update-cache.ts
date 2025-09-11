// SPDX-License-Identifier: Apache-2.0
import { createConditionsBuffer } from '@tazama-lf/frms-coe-lib/lib/helpers/protobuf';
import type { AccountConditionResponse, EntityConditionResponse } from '@tazama-lf/frms-coe-lib/lib/interfaces/event-flow/ConditionDetails';
import { databaseManager, loggerService } from '..';

export const updateCache = async (key: string, payload: AccountConditionResponse | EntityConditionResponse): Promise<void> => {
  const buf = createConditionsBuffer(payload);
  if (!buf?.byteLength) {
    loggerService.error('payload cannot be serialized into buffer', 'cache', key);
  } else {
    await databaseManager.set(key, buf);
  }
};
