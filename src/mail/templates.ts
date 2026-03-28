export type EmailTemplateCategory =
  | 'invitations'
  | 'appointments'
  | 'documents'
  | 'run_sheet'
  | 'tasks'
  | 'security'
  | 'account';

export type EmailTemplateKey =
  | 'SUPPLIER_INVITATION_FLOW_A'
  | 'SUPPLIER_INVITATION_FLOW_B'
  | 'INVITATION_ACCEPTED'
  | 'INVITATION_DECLINED'
  | 'INVITATION_EXPIRY_REMINDER'
  | 'APPOINTMENT_CREATED'
  | 'APPOINTMENT_UPDATED'
  | 'APPOINTMENT_CANCELED'
  | 'DOCUMENT_SHARED'
  | 'ROS_PUBLISHED'
  | 'TASK_ASSIGNED'
  | 'PASSWORD_RESET'
  | 'ACCOUNT_WELCOME';

export type EmailTemplateRenderResult = {
  subject: string;
  html: string;
  text: string;
  category: EmailTemplateCategory;
  critical: boolean;
};

export type EmailTemplateRenderContext = {
  unsubscribeUrl: string | null;
  legalFooter: string;
};

export const EMAIL_BRANDING = {
  appName: 'Wedding Management App',
  primaryColor: '#0B5FFF',
  logoUrl: 'https://assets.managementapp.local/logo.png',
  legalName: 'ManagementApp B.V.',
  legalAddress: 'Herengracht 101, 1015 BK Amsterdam, The Netherlands',
};

function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function withBranding(contentHtml: string, context: EmailTemplateRenderContext, critical: boolean): string {
  const unsubscribeSection =
    !critical && context.unsubscribeUrl
      ? `<p style="margin-top: 16px; font-size: 12px; color: #6B7280;">Too many emails? <a href="${escapeHtml(
          context.unsubscribeUrl
        )}">Unsubscribe from non-critical updates</a>.</p>`
      : '';

  return `
  <div style="background:#F8FAFC;padding:24px;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #E5E7EB;">
      <div style="padding:20px 24px;border-bottom:1px solid #E5E7EB;">
        <img src="${escapeHtml(EMAIL_BRANDING.logoUrl)}" alt="${escapeHtml(EMAIL_BRANDING.appName)} logo" style="height:28px;display:block;" />
      </div>
      <div style="padding:24px;">
        ${contentHtml}
      </div>
      <div style="padding:16px 24px;border-top:1px solid #E5E7EB;font-size:12px;color:#6B7280;">
        <p style="margin:0;">${escapeHtml(context.legalFooter)}</p>
        ${unsubscribeSection}
      </div>
    </div>
  </div>
  `.trim();
}

function template(
  category: EmailTemplateCategory,
  critical: boolean,
  subject: string,
  contentHtml: string,
  text: string,
  context: EmailTemplateRenderContext
): EmailTemplateRenderResult {
  return {
    subject,
    html: withBranding(contentHtml, context, critical),
    text,
    category,
    critical,
  };
}

type BuildFn = (data: any, context: EmailTemplateRenderContext) => EmailTemplateRenderResult;

export const EmailTemplates: Record<EmailTemplateKey, BuildFn> = {
  SUPPLIER_INVITATION_FLOW_A: (data, context) =>
    template(
      'invitations',
      false,
      `Supplier invitation: ${data.coupleName} wedding workspace`,
      `<h1 style="margin:0 0 12px;">You're invited as a supplier</h1>
       <p style="margin:0 0 12px;">${escapeHtml(data.coupleName)} invited your existing account to collaborate on their wedding.</p>
       <p style="margin:0 0 20px;"><a href="${escapeHtml(data.inviteUrl)}" style="background:${EMAIL_BRANDING.primaryColor};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Accept invitation</a></p>`,
      `${data.coupleName} invited your existing account. Accept invitation: ${data.inviteUrl}`,
      context
    ),
  SUPPLIER_INVITATION_FLOW_B: (data, context) =>
    template(
      'invitations',
      false,
      `Create your supplier account for ${data.coupleName}`,
      `<h1 style="margin:0 0 12px;">Create your supplier account</h1>
       <p style="margin:0 0 12px;">${escapeHtml(data.coupleName)} invited your email address. Create an account to continue.</p>
       <p style="margin:0 0 20px;"><a href="${escapeHtml(data.signupUrl)}" style="background:${EMAIL_BRANDING.primaryColor};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;">Create account and accept</a></p>`,
      `Create your supplier account and accept invitation: ${data.signupUrl}`,
      context
    ),
  INVITATION_ACCEPTED: (data, context) =>
    template(
      'invitations',
      false,
      `Invitation accepted by ${data.supplierName}`,
      `<h1 style="margin:0 0 12px;">Invitation accepted</h1>
       <p style="margin:0;">${escapeHtml(data.supplierName)} accepted the invitation for ${escapeHtml(
         data.coupleName
       )}.</p>`,
      `${data.supplierName} accepted the invitation for ${data.coupleName}.`,
      context
    ),
  INVITATION_DECLINED: (data, context) =>
    template(
      'invitations',
      false,
      `Invitation declined by ${data.supplierName}`,
      `<h1 style="margin:0 0 12px;">Invitation declined</h1>
       <p style="margin:0 0 8px;">${escapeHtml(data.supplierName)} declined the invitation for ${escapeHtml(
         data.coupleName
       )}.</p>
       <p style="margin:0;"><strong>Reason:</strong> ${escapeHtml(data.reason)}</p>`,
      `${data.supplierName} declined the invitation. Reason: ${data.reason}`,
      context
    ),
  INVITATION_EXPIRY_REMINDER: (data, context) =>
    template(
      'invitations',
      false,
      `Invitation expires on ${data.expiresAt}`,
      `<h1 style="margin:0 0 12px;">Invitation expires soon</h1>
       <p style="margin:0 0 12px;">Your invitation for ${escapeHtml(data.coupleName)} expires in 48 hours.</p>
       <p style="margin:0;"><a href="${escapeHtml(data.inviteUrl)}">Open invitation</a></p>`,
      `Invitation for ${data.coupleName} expires soon. Open: ${data.inviteUrl}`,
      context
    ),
  APPOINTMENT_CREATED: (data, context) =>
    template(
      'appointments',
      false,
      `Appointment created: ${data.title}`,
      `<h1 style="margin:0 0 12px;">New appointment</h1>
       <p style="margin:0 0 8px;">${escapeHtml(data.title)}</p>
       <p style="margin:0;">${escapeHtml(data.startAt)} - ${escapeHtml(data.endAt)}</p>`,
      `Appointment created: ${data.title} (${data.startAt} - ${data.endAt})`,
      context
    ),
  APPOINTMENT_UPDATED: (data, context) =>
    template(
      'appointments',
      false,
      `Appointment updated: ${data.title}`,
      `<h1 style="margin:0 0 12px;">Appointment updated</h1>
       <p style="margin:0;">${escapeHtml(data.title)} has been updated.</p>`,
      `Appointment updated: ${data.title}`,
      context
    ),
  APPOINTMENT_CANCELED: (data, context) =>
    template(
      'appointments',
      false,
      `Appointment canceled: ${data.title}`,
      `<h1 style="margin:0 0 12px;">Appointment canceled</h1>
       <p style="margin:0;">${escapeHtml(data.title)} has been canceled.</p>`,
      `Appointment canceled: ${data.title}`,
      context
    ),
  DOCUMENT_SHARED: (data, context) =>
    template(
      'documents',
      false,
      `Document shared in ${data.weddingName}`,
      `<h1 style="margin:0 0 12px;">Document shared</h1>
       <p style="margin:0 0 12px;">A document was shared in ${escapeHtml(data.weddingName)}.</p>
       <p style="margin:0;"><a href="${escapeHtml(data.documentUrl)}">Open document library</a></p>`,
      `A document was shared in ${data.weddingName}. Open: ${data.documentUrl}`,
      context
    ),
  ROS_PUBLISHED: (data, context) =>
    template(
      'run_sheet',
      false,
      `Run-of-show published (v${data.version})`,
      `<h1 style="margin:0 0 12px;">Run-of-show published</h1>
       <p style="margin:0 0 12px;">Version ${escapeHtml(String(data.version))} is now available.</p>
       <p style="margin:0;"><a href="${escapeHtml(data.viewUrl)}">View run-of-show</a></p>`,
      `Run-of-show version ${data.version} published. View: ${data.viewUrl}`,
      context
    ),
  TASK_ASSIGNED: (data, context) =>
    template(
      'tasks',
      false,
      `Task assigned: ${data.taskTitle}`,
      `<h1 style="margin:0 0 12px;">New task assigned</h1>
       <p style="margin:0;">${escapeHtml(data.taskTitle)}</p>`,
      `New task assigned: ${data.taskTitle}`,
      context
    ),
  PASSWORD_RESET: (data, context) =>
    template(
      'security',
      true,
      'Reset your password',
      `<h1 style="margin:0 0 12px;">Reset your password</h1>
       <p style="margin:0 0 12px;">Use the secure link below to reset your password.</p>
       <p style="margin:0;"><a href="${escapeHtml(data.resetUrl)}">Reset password</a></p>`,
      `Reset your password: ${data.resetUrl}`,
      context
    ),
  ACCOUNT_WELCOME: (data, context) =>
    template(
      'account',
      true,
      `Welcome to ${EMAIL_BRANDING.appName}`,
      `<h1 style="margin:0 0 12px;">Welcome, ${escapeHtml(data.firstName || 'there')}</h1>
       <p style="margin:0;">Your account is ready. Open your workspace to continue onboarding.</p>`,
      `Welcome to ${EMAIL_BRANDING.appName}. Your account is ready.`,
      context
    ),
};
