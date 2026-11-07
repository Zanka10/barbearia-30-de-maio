import { AppError } from '../utils/errors.js';

const SQLITE_MESSAGES = [
  [/CONFLITO_HORARIO/, 409, 'Este horário acabou de ser ocupado. Escolha outro horário.', 'SLOT_TAKEN'],
  [/ATENDIMENTO_CONCLUIDO_IMUTAVEL/, 409, 'Atendimentos concluídos não podem ser alterados.', 'COMPLETED_LOCKED'],
  [/UNIQUE constraint failed: (users|clients)\.phone/, 409, 'Já existe um cadastro com este celular.', 'DUPLICATE_PHONE'],
  [/UNIQUE constraint failed: users\.email/, 409, 'Já existe um usuário com este e-mail.', 'DUPLICATE_EMAIL'],
  [/UNIQUE constraint failed: categories\.name/, 409, 'Já existe uma categoria com este nome.', 'DUPLICATE'],
  [/UNIQUE constraint failed: services\./, 409, 'Já existe um serviço com este nome nesta categoria.', 'DUPLICATE'],
  [/UNIQUE constraint failed: holidays\.date/, 409, 'Já existe um feriado cadastrado nesta data.', 'DUPLICATE'],
  [/UNIQUE constraint failed/, 409, 'Registro duplicado.', 'DUPLICATE'],
  [/FOREIGN KEY constraint failed/, 409, 'Este registro está vinculado a outros dados e não pode ser removido. Considere desativá-lo.', 'IN_USE'],
  [/CHECK constraint failed/, 400, 'Dados inválidos para o banco de dados.', 'CHECK_FAILED'],
];

export function notFoundApi(req, res) {
  res.status(404).json({ error: { message: 'Rota não encontrada.', code: 'NOT_FOUND' } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
  }
  if (err?.code === 'ERR_SQLITE_ERROR' || /constraint failed|CONFLITO_|IMUTAVEL/.test(err?.message || '')) {
    for (const [re, status, message, code] of SQLITE_MESSAGES) {
      if (re.test(err.message)) return res.status(status).json({ error: { message, code } });
    }
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'JSON inválido.', code: 'BAD_JSON' } });
  }
  if (err?.name === 'MulterError') {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 2 MB).' : 'Falha no upload do arquivo.';
    return res.status(400).json({ error: { message, code: err.code } });
  }
  console.error('[erro]', req.method, req.originalUrl, err);
  res.status(500).json({ error: { message: 'Erro interno. Tente novamente em instantes.', code: 'INTERNAL' } });
}
