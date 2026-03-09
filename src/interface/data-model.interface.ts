// SPDX-License-Identifier: Apache-2.0
import type { TazamaField } from '@tazama-lf/tcs-lib';

export interface CollectionWithFields {
  name: string;
  type: string;
  collection_id: number;
  fields: TazamaField[];
}
