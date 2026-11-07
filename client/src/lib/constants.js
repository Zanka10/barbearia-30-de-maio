export const STATUS = {
  pending: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmado', tone: 'info' },
  in_service: { label: 'Em atendimento', tone: 'gold' },
  completed: { label: 'Concluído', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'danger' },
  no_show: { label: 'Não compareceu', tone: 'muted' },
};
export const STATUS_KEYS = Object.keys(STATUS);

export const PAYMENT = { cash: 'Dinheiro', pix: 'PIX', debit: 'Cartão de débito', credit: 'Cartão de crédito' };
export const PAYMENT_KEYS = Object.keys(PAYMENT);

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const ROLE_LABEL = { admin: 'Administrador', barber: 'Barbeiro', client: 'Cliente' };
