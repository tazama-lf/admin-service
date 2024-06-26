
// SPDX-License-Identifier: Apache-2.0

const handleHealthCheck = async (): Promise<{ status: string }> => {
  return {
    status: 'UP',
  };
};

export { handleHealthCheck };
