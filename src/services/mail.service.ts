import crypto from 'node:crypto';
import {
  EMAIL_BRANDING,
  EmailTemplates,
  type EmailTemplateCategory,
  type EmailTemplateKey,
  type EmailTemplateRenderResult,
} from '../mail/templates';

type MailProvider = 'postmark' | 'sendgrid' | 'ses';

type MailConfig = {
  provider: MailProvider;
  fromEmail: string;
  environment: 'local' | 'staging' | 'production';
};

type SignedLinkPayload = {
  purpose: string;
  recipient?: string;
  category?: string;
  iat: number;
  exp: number;
  nonce: string;
  claims: Record<string, string>;
};

type SentMailLog = {
  to: string;
  from: string;
  templateKey: EmailTemplateKey;
  subject: string;
  category: EmailTemplateCategory;
  critical: boolean;
  html: string;
  text: string;
  sentAt: string;
  provider: MailProvider;
};

type SendOptions = {
  overrideCategory?: EmailTemplateCategory;
};

const DEFAULT_CONFIG: MailConfig = {
  provider: 'postmark',
  fromEmail: 'no-reply@managementapp.local',
  environment: 'staging',
};

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function safeTimingCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/**
 * Phase 7.1 Mail Service
 */
export class MailService {
  private static config: MailConfig = { ...DEFAULT_CONFIG };
  private static sentMail: SentMailLog[] = [];
  private static unsubscribedByEmail = new Map<string, Set<EmailTemplateCategory>>();
  private static readonly tokenSecret = process.env.MAIL_TOKEN_SECRET || 'mail-dev-secret-change-me';

  /**
   * 7.1.1 Choose and configure transactional provider
   */
  static configure(configPatch: Partial<MailConfig>) {
    this.config = {
      ...this.config,
      ...configPatch,
    };
    return { ...this.config };
  }

  static getConfig() {
    return { ...this.config };
  }

  /**
   * 7.1.5 Signed, time-limited tokenized links
   */
  static generateSignedLink(
    baseUrl: string,
    params: Record<string, string>,
    options: {
      purpose: string;
      recipient?: string;
      category?: string;
      ttlSeconds?: number;
      now?: Date;
    }
  ): string {
    const now = options.now || new Date();
    const payload: SignedLinkPayload = {
      purpose: options.purpose,
      recipient: options.recipient?.toLowerCase(),
      category: options.category,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(now.getTime() / 1000) + (options.ttlSeconds || 48 * 60 * 60),
      nonce: crypto.randomBytes(16).toString('hex'),
      claims: { ...params },
    };

    const encoded = base64url(JSON.stringify(payload));
    const signature = crypto.createHmac('sha256', this.tokenSecret).update(encoded).digest('hex');
    const token = `${encoded}.${signature}`;

    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  static verifySignedToken(
    token: string,
    options: { purpose?: string; recipient?: string; now?: Date } = {}
  ): { valid: boolean; payload?: SignedLinkPayload; reason?: string } {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) {
      return { valid: false, reason: 'malformed_token' };
    }

    const expected = crypto.createHmac('sha256', this.tokenSecret).update(encoded).digest('hex');
    if (!safeTimingCompare(signature, expected)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    let payload: SignedLinkPayload;
    try {
      payload = JSON.parse(fromBase64url(encoded));
    } catch {
      return { valid: false, reason: 'invalid_payload' };
    }

    const now = Math.floor((options.now || new Date()).getTime() / 1000);
    if (payload.exp < now) {
      return { valid: false, reason: 'expired' };
    }
    if (options.purpose && payload.purpose !== options.purpose) {
      return { valid: false, reason: 'purpose_mismatch' };
    }
    if (
      options.recipient &&
      payload.recipient &&
      payload.recipient !== options.recipient.toLowerCase()
    ) {
      return { valid: false, reason: 'recipient_mismatch' };
    }

    return { valid: true, payload };
  }

  /**
   * 7.1.6 Unsubscribe mechanism for non-critical emails
   */
  static unsubscribe(email: string, category: EmailTemplateCategory) {
    const normalized = email.trim().toLowerCase();
    const existing = this.unsubscribedByEmail.get(normalized) || new Set<EmailTemplateCategory>();
    existing.add(category);
    this.unsubscribedByEmail.set(normalized, existing);
    return { email: normalized, category, unsubscribed: true };
  }

  static unsubscribeFromToken(token: string, now?: Date) {
    const verified = this.verifySignedToken(token, { purpose: 'unsubscribe', now });
    if (!verified.valid || !verified.payload?.recipient || !verified.payload?.category) {
      return { success: false, reason: verified.reason || 'invalid_token' };
    }
    const category = verified.payload.category as EmailTemplateCategory;
    this.unsubscribe(verified.payload.recipient, category);
    return {
      success: true,
      email: verified.payload.recipient,
      category,
    };
  }

  static resubscribe(email: string, category: EmailTemplateCategory) {
    const normalized = email.trim().toLowerCase();
    const existing = this.unsubscribedByEmail.get(normalized);
    if (!existing) {
      return { email: normalized, category, unsubscribed: false };
    }
    existing.delete(category);
    if (existing.size === 0) {
      this.unsubscribedByEmail.delete(normalized);
    } else {
      this.unsubscribedByEmail.set(normalized, existing);
    }
    return { email: normalized, category, unsubscribed: false };
  }

  static isUnsubscribed(email: string, category: EmailTemplateCategory): boolean {
    const normalized = email.trim().toLowerCase();
    const existing = this.unsubscribedByEmail.get(normalized);
    return Boolean(existing && existing.has(category));
  }

  /**
   * Send email using configured provider (simulated transport in local/staging)
   */
  static async send(
    to: string,
    templateKey: EmailTemplateKey,
    data: Record<string, unknown>,
    options: SendOptions = {}
  ) {
    const normalizedTo = to.trim().toLowerCase();
    const initialContext = this.getRenderContext(normalizedTo, options.overrideCategory || null);
    let rendered = this.renderTemplate(templateKey, data, initialContext);
    const category = options.overrideCategory || rendered.category;
    if (!options.overrideCategory && rendered.category !== 'account') {
      const contextual = this.getRenderContext(normalizedTo, rendered.category);
      rendered = this.renderTemplate(templateKey, data, contextual);
    }

    if (!rendered.critical && this.isUnsubscribed(normalizedTo, category)) {
      return {
        skipped: true,
        reason: 'unsubscribed',
        category,
      };
    }

    const log: SentMailLog = {
      to: normalizedTo,
      from: this.config.fromEmail,
      templateKey,
      subject: rendered.subject,
      category,
      critical: rendered.critical,
      html: rendered.html,
      text: rendered.text,
      sentAt: new Date().toISOString(),
      provider: this.config.provider,
    };
    this.sentMail.push(log);

    return {
      skipped: false,
      messageId: `mail-${crypto.randomUUID()}`,
      provider: this.config.provider,
      envelope: { from: this.config.fromEmail, to: normalizedTo },
      template: templateKey,
      subject: rendered.subject,
      category,
      environment: this.config.environment,
    };
  }

  static getSentMailForTests() {
    return this.sentMail.map((item) => ({ ...item }));
  }

  static clearStateForTests() {
    this.config = { ...DEFAULT_CONFIG };
    this.sentMail = [];
    this.unsubscribedByEmail.clear();
  }

  private static renderTemplate(
    templateKey: EmailTemplateKey,
    data: Record<string, unknown>,
    context: { unsubscribeUrl: string | null; legalFooter: string }
  ): EmailTemplateRenderResult {
    const template = EmailTemplates[templateKey];
    if (!template) {
      throw new Error(`Unknown template: ${templateKey}`);
    }
    return template(data, context);
  }

  private static getRenderContext(to: string, overrideCategory: EmailTemplateCategory | null) {
    const category = overrideCategory || 'account';
    const unsubscribeUrl = this.generateSignedLink(
      'https://managementapp.local/v1/mail/unsubscribe',
      { email: to, category },
      {
        purpose: 'unsubscribe',
        recipient: to,
        category,
        ttlSeconds: 30 * 24 * 60 * 60,
      }
    );
    return {
      unsubscribeUrl,
      legalFooter: `${EMAIL_BRANDING.legalName} · ${EMAIL_BRANDING.legalAddress}`,
    };
  }
}
