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
