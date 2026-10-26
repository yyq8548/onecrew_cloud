export class CloudHttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 501 | 502 | 503;
  constructor(code: string, status: CloudHttpError["status"]) {
    super(code);
    this.name = "CloudHttpError";
    this.status = status;
  }
}
