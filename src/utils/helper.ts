export const flattenPayloadPaths = (obj: unknown, prefix = ''): string[] => {
  if (Array.isArray(obj)) {
    return obj.flatMap((item, index) => flattenPayloadPaths(item, `${prefix}[${index}]`));
  }
  if (typeof obj !== 'object' || obj === null) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'object' && val !== null && (Array.isArray(val) || Object.keys(val).length > 0)) {
      return flattenPayloadPaths(val, path);
    }
    return [path];
  });
};

export const gettxtpAndVersionFromUrl = (url: string): { txtp: string; version: string } => {
  const input = url.trim();
  const pathname = input.includes('://') ? new URL(input).pathname : input;
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    throw new Error('Invalid URL format. Expected at least version and txtp segments.');
  }

  return {
    version: segments[1],
    txtp: segments[segments.length - 1],
  };
};
