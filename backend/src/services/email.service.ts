import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../config/env.js";
import { shouldSimulate } from "./demo-simulation.service.js";

export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSendResult = {
  providerId: string;
};

export type EmailTransportName = "resend" | "smtp" | "test" | "unconfigured";

export interface EmailTransport {
  name: EmailTransportName;
  configured: boolean;
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

export const testEmailOutbox: EmailSendInput[] = [];

class UnconfiguredEmailTransport implements EmailTransport {
  name = "unconfigured" as const;
  configured = false;

  async send(): Promise<EmailSendResult> {
    throw new Error("Email is not configured.");
  }
}

export class TestEmailTransport implements EmailTransport {
  name = "test" as const;
  configured = true;

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    testEmailOutbox.push(input);
    return { providerId: `test-${testEmailOutbox.length}` };
  }
}

class ResendEmailTransport implements EmailTransport {
  name = "resend" as const;
  configured = true;
  private client: Resend;

  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const result = await this.client.emails.send({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    if (result.error) {
      throw new Error("The email provider rejected this message.");
    }

    return { providerId: result.data?.id ?? "resend" };
  }
}

class SmtpEmailTransport implements EmailTransport {
  name = "smtp" as const;
  configured = true;
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === true,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    const info = await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { providerId: String(info.messageId ?? "smtp") };
  }
}

export function createEmailTransport(): EmailTransport {
  if (env.EMAIL_PROVIDER === "test") {
    return new TestEmailTransport();
  }

  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
    return new ResendEmailTransport(env.RESEND_API_KEY);
  }

  if (env.EMAIL_PROVIDER === "smtp" && env.SMTP_HOST) {
    return new SmtpEmailTransport();
  }

  return new UnconfiguredEmailTransport();
}

export const emailTransport = createEmailTransport();

export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  if (await shouldSimulate("EMAIL")) {
    throw new Error("Simulated email failure.");
  }
  return emailTransport.send(input);
}

export function getEmailConfigurationState(): {
  configured: boolean;
  provider: EmailTransportName;
} {
  return {
    configured: emailTransport.configured,
    provider: emailTransport.name,
  };
}
