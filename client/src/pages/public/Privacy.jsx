import { useShop } from '../../context/ShopContext.jsx';

export default function Privacy() {
  const { settings: s } = useShop();
  const contact = s.privacy_contact || s.shop_email || s.shop_phone || 'diretamente na barbearia';
  return (
    <div className="container prose" style={{ maxWidth: 800, padding: '48px 20px 80px' }}>
      <span className="eyebrow">LGPD</span>
      <h1 style={{ fontSize: 36, margin: '12px 0 20px' }}>Política de Privacidade</h1>
      <p>
        Esta política explica como a <strong>{s.shop_name}</strong> trata os seus dados pessoais, em conformidade com a Lei Geral de Proteção de
        Dados (Lei nº 13.709/2018 — LGPD).
      </p>

      <h2>1. Quais dados coletamos</h2>
      <ul>
        <li>Nome completo e número de celular (obrigatórios para o agendamento);</li>
        <li>E-mail (opcional, para envio de confirmações);</li>
        <li>Histórico de agendamentos e serviços realizados, valores e forma de pagamento;</li>
        <li>Dados técnicos de acesso (endereço IP e data/hora) para segurança e auditoria.</li>
      </ul>

      <h2>2. Para que usamos</h2>
      <ul>
        <li>Gerenciar seus agendamentos e identificar seu cadastro pelo celular, evitando duplicidades;</li>
        <li>Enviar confirmações, alterações e cancelamentos de horário;</li>
        <li>Manter o histórico de atendimentos e cumprir obrigações legais, fiscais e contábeis.</li>
      </ul>
      <p>
        A base legal é a <strong>execução do serviço solicitado</strong> e o seu <strong>consentimento</strong>, registrado no momento do agendamento ou
        cadastro. Não vendemos nem compartilhamos seus dados com terceiros para fins de marketing.
      </p>

      <h2>3. Quem tem acesso</h2>
      <p>
        O acesso é restrito por perfil: o administrador da barbearia acessa o cadastro completo; cada barbeiro visualiza apenas os dados dos clientes
        que atende; você acessa somente os seus próprios dados, mediante login e senha.
      </p>

      <h2>4. Segurança</h2>
      <p>
        Senhas são armazenadas com hash criptográfico (scrypt), as sessões usam cookies protegidos, os acessos e alterações são registrados em trilha
        de auditoria e o banco de dados possui backups periódicos.
      </p>

      <h2>5. Seus direitos</h2>
      <ul>
        <li>Confirmar a existência e acessar seus dados;</li>
        <li>Corrigir dados incompletos ou desatualizados;</li>
        <li>Solicitar a portabilidade — na área do cliente, use “Exportar meus dados”;</li>
        <li>
          Solicitar a eliminação — na área do cliente, use “Excluir minha conta”. Registros financeiros são mantidos de forma anonimizada pelo prazo
          exigido em lei;
        </li>
        <li>Revogar o consentimento a qualquer momento.</li>
      </ul>

      <h2>6. Contato</h2>
      <p>Para exercer seus direitos ou tirar dúvidas sobre privacidade, entre em contato: {contact}.</p>
    </div>
  );
}
