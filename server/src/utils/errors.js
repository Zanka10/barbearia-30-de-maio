export class AppError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, { code: 'BAD_REQUEST', details });
export const unauthorized = (msg = 'Autenticação necessária.') => new AppError(401, msg, { code: 'UNAUTHORIZED' });
export const forbidden = (msg = 'Você não tem permissão para esta ação.') => new AppError(403, msg, { code: 'FORBIDDEN' });
export const notFound = (msg = 'Registro não encontrado.') => new AppError(404, msg, { code: 'NOT_FOUND' });
export const conflict = (msg, code = 'CONFLICT') => new AppError(409, msg, { code });
