import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Porta de envio de mensagens. WhatsApp/SMS entram como outros adaptadores desta porta. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
