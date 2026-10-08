import type { CorrelationStore } from "../store/correlation-store.js";
import type { NotificationStore } from "../store/notification-store.js";
import { fcmErrorCode, isInvalidFcmToken, type FcmGateway } from "./fcm-gateway.js";
import { renderPilotNotification } from "./templates.js";

export class NotificationProcessor {
  constructor(
    private readonly notifications: NotificationStore,
    private readonly correlation: CorrelationStore,
    private readonly pilotUserIds: readonly string[],
    private readonly fcm: FcmGateway | null,
  ) {}

  async process(event: Record<string, unknown>): Promise<void> {
    const rendered = renderPilotNotification(event);
    if (!rendered) return;
    const eventId = String(event.id ?? "");
    if (!eventId) throw new Error("Notification source event is missing id.");

    const targetUserIds = rendered.audience === "all-pilot-users"
      ? [...this.pilotUserIds]
      : [await this.resolveOrderOwner(event)];
    const transientFailures: string[] = [];

    for (const userId of targetUserIds) {
      const notification = await this.notifications.create(userId, {
        templateKey: rendered.templateKey,
        title: rendered.title,
        body: rendered.body,
        deepLink: rendered.deepLink,
        sourceEventId: eventId,
      });
      if (!this.fcm) continue;

      for (const device of await this.notifications.activeDevices(userId)) {
        const attempt = await this.notifications.beginDelivery(notification.id, device.id);
        if (attempt.status === "sent") continue;
        try {
          const providerId = await this.fcm.send({
            token: device.token,
            notificationId: notification.id,
            templateKey: notification.template_key,
            title: notification.title,
            body: notification.body,
            deepLink: notification.deep_link ?? undefined,
          });
          await this.notifications.deliverySent(attempt.id, providerId);
        } catch (error) {
          const code = fcmErrorCode(error);
          await this.notifications.deliveryFailed(attempt.id, code, 5_000);
          if (isInvalidFcmToken(code)) {
            await this.notifications.deactivateDevice(device.id);
          } else {
            transientFailures.push(`${device.id}:${code}`);
          }
        }
      }
    }

    if (transientFailures.length) {
      throw new Error(`FCM delivery failed: ${transientFailures.join(", ")}`);
    }
  }

  async deadLetter(event: Record<string, unknown>, error: string): Promise<void> {
    const eventId = String(event.id ?? "");
    if (eventId) await this.notifications.deadLetterSourceEvent(eventId, error);
  }

  private async resolveOrderOwner(event: Record<string, unknown>): Promise<string> {
    const payload = event.payload && typeof event.payload === "object"
      ? event.payload as Record<string, unknown>
      : {};
    const checkoutRef = typeof payload.cart_id === "string"
      ? payload.cart_id
      : String(event.aggregate_id ?? "");
    const record = checkoutRef ? await this.correlation.get(checkoutRef) : null;
    if (!record?.owner_user_id) {
      throw new Error(`No canonical pilot owner for notification event ${String(event.id ?? "?")}.`);
    }
    return record.owner_user_id;
  }
}
