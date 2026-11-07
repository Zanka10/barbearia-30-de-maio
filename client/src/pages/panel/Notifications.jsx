import NotificationList from '../../components/NotificationList.jsx';
import { PageHeader } from '../../components/ui.jsx';

export default function Notifications() {
  return (
    <div>
      <PageHeader
        title="Notificações"
        description="Novos agendamentos, alterações de horário e cancelamentos. Também enviadas por e-mail ao barbeiro responsável."
      />
      <NotificationList />
    </div>
  );
}
