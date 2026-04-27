declare module "nodemailer" {
  export interface TransportOptions {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  }

  export interface MailOptions {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }

  export interface MailResult {
    messageId: string;
    accepted: Array<string | { address?: string }>;
    rejected: Array<string | { address?: string }>;
  }

  export interface MailTransporter {
    verify(): Promise<void>;
    sendMail(options: MailOptions): Promise<MailResult>;
  }

  export function createTransport(options: TransportOptions): MailTransporter;

  const nodemailer: {
    createTransport: typeof createTransport;
  };

  export default nodemailer;
}
