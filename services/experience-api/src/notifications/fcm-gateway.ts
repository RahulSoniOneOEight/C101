import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const STAGING_FIREBASE_PROJECT = "buildkart-staging";

export class FcmGateway {
  private readonly messaging;

  constructor(projectId: string) {
    if (projectId !== STAGING_FIREBASE_PROJECT) {
      throw new Error(`FCM delivery is restricted to ${STAGING_FIREBASE_PROJECT}.`);
    }
    const app = initializeApp(
      { credential: applicationDefault(), projectId },
      `buildkart-staging-fcm-${process.pid}`,
    );
    this.messaging = getMessaging(app);
  }

  async send(input: {
    token: string;
    notificationId: string;
    templateKey: string;
    title: string;
    body: string;
    deepLink?: string;
    imageUrl?: string;
  }): Promise<string> {
    return this.messaging.send({
      token: input.token,
      notification: {
        title: input.title,
        body: input.body,
        ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      },
      data: {
        notification_id: input.notificationId,
        template_key: input.templateKey,
        deep_link: input.deepLink ?? "/notifications",
        ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
        environment: "staging",
        test_data: "true",
      },
      android: {
        priority: "high",
        ...(input.imageUrl
          ? { notification: { imageUrl: input.imageUrl, channelId: "buildkart_staging", sound: "default" } }
          : {}),
      },
    });
  }
}

export function fcmErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String(error.code);
  return error instanceof Error ? error.message : "unknown-fcm-error";
}

export function isInvalidFcmToken(code: string): boolean {
  return code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token";
}
