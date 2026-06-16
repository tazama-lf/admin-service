// SPDX-License-Identifier: Apache-2.0
import qs from 'qs';

// `qs` defaults `arrayLimit` to 20: once an array index exceeds 20 it silently degrades the array
// into an object keyed by the numeric indices, which the Ajv array schemas (e.g. the batch-fetch
// `keys` set) then reject with 400. Align the limit with the schema cap (configListQuerySchema
// `keys` maxItems = 200) so realistic requests - a network map referencing 30+ rules - parse as an
// array and are bounded by the schema rather than truncated by the parser (#432).
export const QS_ARRAY_LIMIT = 200;

export const parseQueryString = (str: string): ReturnType<typeof qs.parse> => qs.parse(str, { arrayLimit: QS_ARRAY_LIMIT });
