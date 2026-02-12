export class HttpException extends Error {
  constructor(
    public readonly response: string | Record<string, unknown>,
    public readonly status: number,
    options?: object,
  ) {
    super(typeof response === 'string' ? response : ((response.message as string | undefined) ?? 'Internal server error'), options);
  }

  public getStatus(): number {
    return this.status;
  }

  public getResponse(): string | Record<string, unknown> {
    return this.response;
  }
}

export const HttpStatus = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  FORBIDDEN: 403,
};
