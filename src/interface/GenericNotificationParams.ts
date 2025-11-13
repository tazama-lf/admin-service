import type { NotificationEvent, ConfigData } from '../handlers/workflow.handler';

export interface GenericNotificationParams {
  event: NotificationEvent;
  configId: number;
  config: ConfigData;
  tenantId: string;
  actorEmail: string;
  actorName: string | null;
  comment?: string;
}
