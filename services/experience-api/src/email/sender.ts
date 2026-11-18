export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Minimal Resend transactional sender. The API key is server-side only. */
export class ResendEmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend rejected the message (${response.status}): ${body.slice(0, 200)}`);
    }
  }
}
