// SPDX-License-Identifier: Apache-2.0
// Use mock postgres instead of actual in jest
const postgres = jest.requireActual('pg');

class MockPool {
  connect() {
    return {
      query: (query) => {
        return query;
      },
      release: () => {
        return true;
      },
    };
  }

  query(query) {
    return query;
  }

  end() {
    return undefined;
  }
}

const mockPostgres = { ...postgres, Pool: MockPool };

jest.mock('pg', () => mockPostgres);
