import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { AuthController } from './controllers/auth.controller';
import { ROSController } from './controllers/ros.controller';
import {
  acceptInvitationFlowB,
  acceptInvitation,
  acceptInvitationById,
  createInvitation,
  declineInvitation,
  declineInvitationById,
  listPendingInvitationsForEmail,
  listWeddingInvitations,
  resolveInvitation,
  resendInvitation,
  revokeInvitation,
  updateChecklist,
} from './controllers/invitation.controller';
import { ChatController } from './controllers/chat.controller';
import { DocumentController } from './controllers/document.controller';
import { DocumentService } from './services/collaboration.service';
import { UploadController } from './controllers/upload.controller';
import { CalendarController } from './controllers/calendar.controller';
import { NotificationController } from './controllers/notification.controller';
import { SupplierController } from './controllers/supplier.controller';
import {
  createWedding,
  getSupplierWeddings,
  getWeddingById,
  searchWeddings,
  updateWedding,
} from './controllers/dashboard.controller';
import { findWeddingById } from './repositories/weddings.repo';
import { authMiddleware } from './middleware/auth.middleware';
import { InvitationService } from './services/invitation.service';
import { RealtimeService } from './services/realtime.service';
import { EntitlementService } from './services/entitlement.service';
import { RuntimePersistenceService } from './services/runtime-persistence.service';
import { SupplierDirectoryService } from './services/supplier-directory.service';
import { AuthService } from './services/auth.service';
import { DashboardService } from './services/dashboard.service';

// Validate required secrets are set in non-development environments
const isDev = process.env.NODE_ENV !== 'production';
const requiredSecrets = ['JWT_SECRET', 'MAIL_TOKEN_SECRET', 'STRIPE_WEBHOOK_SECRET'] as const;
for (const key of requiredSecrets) {
  if (!process.env[key]) {
    if (isDev) {
      console.warn(`\x1b[33m⚠ ${key} not set — using insecure default. Do NOT use in production.\x1b[0m`);
    } else {
      console.error(`[server] Missing required environment variable: ${key}`);
      process.exit(1);
    }
  }
}

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.use((req: any, res: any, next: any) => {
  const isMutating = req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT' || req.method === 'DELETE';
  if (isMutating) {
    res.on('finish', () => {
      if (res.statusCode < 400) {
        RuntimePersistenceService.queueSave(`${req.method} ${req.path}`);
      }
    });
  }
  next();
});

app.use((req: any, _res: any, next: any) => {
  if (req.path.startsWith('/v1/auth/')) {
    return next();
  }

  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authMiddleware(req, _res, next);
  }

  req.user = {
    sub: req.header('x-user-id') || 'demo-user',
    email: req.header('x-user-email') || '',
    supplier_org_id: req.header('x-supplier-org-id') !== undefined ? req.header('x-supplier-org-id') : 'demo-org',
    is_platform_admin: req.header('x-platform-admin') === 'true',
    role: req.header('x-user-role') || 'supplier',
  };
  next();
});

app.use((req: any, _res: any, next: any) => {
  const isMutating = req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT' || req.method === 'DELETE';
  if (!isMutating) {
    return next();
  }

  if (req.path.startsWith('/v1/auth/')) {
    return next();
  }

  const orgId = req.user?.supplier_org_id;
  if (!orgId) {
    return next();
  }

  EntitlementService.ensureWriteAllowed(orgId, {
    role: req.user?.role,
    isPlatformAdmin: req.user?.is_platform_admin,
  });
  return next();
});

const wrap =
  (fn: any) =>
    (req: any, res: any, next: any): void => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

app.get('/health', (_req: any, res: any) => {
  res.json({ ok: true, service: 'managementapp-local-api' });
});

// Auth
app.get('/v1/auth/.well-known/openid-configuration', wrap(AuthController.discovery));
app.get('/v1/auth/jwks.json', wrap(AuthController.jwks));
app.post('/v1/auth/login', wrap(AuthController.login));
app.post('/v1/auth/oauth', wrap(AuthController.oauthLogin));
app.post('/v1/auth/register', wrap(AuthController.register));
app.post('/v1/auth/refresh', wrap(AuthController.refresh));
app.post('/v1/auth/logout', wrap(AuthController.logout));
app.get('/v1/auth/me', wrap(AuthController.me));

// Suppliers
app.get('/v1/suppliers', wrap(SupplierController.list));
app.get('/v1/suppliers/profile', wrap(SupplierController.getOwnProfile));
app.patch('/v1/suppliers/profile', wrap(SupplierController.upsertOwnProfile));
app.get('/v1/suppliers/:id', wrap(SupplierController.getById));

// Invitations
app.post('/v1/weddings/:id/suppliers/invite', wrap(async (req: any, res: any) => {
  const isPlatformAdmin = Boolean(req.user?.is_platform_admin);
  const { id: wedding_id } = req.params;
  const isAssigned = DashboardService.isUserAssignedToWedding(req.user.sub, wedding_id);
  if (!isAssigned && !isPlatformAdmin) {
    return res.status(403).json({ error: 'Je bent niet toegewezen aan deze bruiloft.' });
  }
  const { email, type, supplier_org_id } = req.body ?? {};
  const emailStr = typeof email === 'string' ? email.trim() : '';
  if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr) || emailStr.length > 254) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  const allowedTypes = ['wedding_supplier_invite', 'couple_invite', 'supplier_invite', 'supplier_to_supplier_invite'];
  const inviteType = type && allowedTypes.includes(type) ? type : 'wedding_supplier_invite';
  const issuer_id = req.user?.sub || req.body.issuer_id;
  const result = await createInvitation(emailStr, wedding_id, inviteType, issuer_id, supplier_org_id);
  res.status(201).json(result);
}));
app.get('/v1/weddings/:id/invitations', wrap(async (req: any, res: any) => {
  const { id: wedding_id } = req.params;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const result = await listWeddingInvitations(wedding_id, status);
  res.json({ invitations: result });
}));
app.get('/v1/invitations/pending', wrap(async (req: any, res: any) => {
  const email = String(req.query.email || '');
  const result = await listPendingInvitationsForEmail(email);
  res.json({ invitations: result });
}));
app.post('/v1/invitations', wrap(async (req: any, res: any) => {
  const { email, wedding_id, type, issuer_id, supplier_org_id } = req.body ?? {};
  const emailStr = typeof email === 'string' ? email.trim() : '';
  if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr) || emailStr.length > 254) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  if (!wedding_id || typeof wedding_id !== 'string') {
    return res.status(400).json({ error: 'wedding_id is required.' });
  }
  const result = await createInvitation(emailStr, wedding_id, type, issuer_id, supplier_org_id);
  res.status(201).json(result);
}));
app.post('/v1/invitations/decline', wrap(async (req: any, res: any) => {
  const { token, inviteId, reason, note } = req.body || {};
  if (!token && !inviteId) {
    return res.status(400).json({ error: 'token or inviteId is required' });
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return res.status(400).json({ error: 'reason is required.' });
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 1024)) {
    return res.status(400).json({ error: 'note must be a string of at most 1024 characters.' });
  }
  const result = token
    ? await declineInvitation(token, reason, note)
    : await declineInvitationById(String(inviteId), reason, note);
  res.json(result);
}));
app.get('/v1/invitations/resolve', wrap(async (req: any, res: any) => {
  const token = String(req.query.token || '');
  const result = await resolveInvitation(token);
  res.json(result);
}));
app.post('/v1/invitations/accept', wrap(async (req: any, res: any) => {
  const { token, inviteId, userId, orgData } = req.body || {};
  if (!token && !inviteId) {
    return res.status(400).json({ error: 'token or inviteId is required' });
  }
  const result = token
    ? await acceptInvitation(token, userId, orgData)
    : await acceptInvitationById(String(inviteId), userId, orgData);
  res.json(result);
}));
app.post('/v1/invitations/accept/flow-b', wrap(async (req: any, res: any) => {
  const { token, accountData, orgData } = req.body;
  const result = await acceptInvitationFlowB(token, accountData, orgData);
  res.json(result);
}));
app.patch('/v1/invitations/checklist', wrap(async (req: any, res: any) => {
  const { userId, itemId, completed } = req.body;
  const result = await updateChecklist(userId, itemId, completed);
  res.json(result);
}));
app.post('/v1/invitations/resend', wrap(async (req: any, res: any) => {
  const { oldInviteId, issuerId } = req.body;
  const result = await resendInvitation(oldInviteId, issuerId);
  res.json(result);
}));
app.post('/v1/invitations/revoke', wrap(async (req: any, res: any) => {
  const { inviteId, issuerId } = req.body;
  const result = await revokeInvitation(inviteId, issuerId);
  res.json(result);
}));
app.post('/v1/internal/jobs/expire-invitations', wrap(async (_req: any, res: any) => {
  const result = InvitationService.expirePendingInvitations();
  res.json(result);
}));
app.get('/v1/invitations/mine', wrap(async (req: any, res: any) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = AuthService.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const result = await listPendingInvitationsForEmail(user.email);
  res.json({ invitations: result });
}));

// Weddings
app.get('/v1/weddings/:id/members', wrap(async (req: any, res: any) => {
  const { id: weddingId } = req.params;
  const members = DashboardService.getWeddingMembers(weddingId);
  res.json({ members });
}));
app.get('/v1/weddings', wrap(async (req: any, res: any) => {
  const result = await getSupplierWeddings({
    userId: req.user.sub,
    supplierOrgId: req.user.supplier_org_id,
    status: req.query.status,
    dateFrom: req.query.date_from ? new Date(req.query.date_from) : undefined,
    dateTo: req.query.date_to ? new Date(req.query.date_to) : undefined,
    myAssignmentsOnly: req.query.my_assignments === 'true',
    search: req.query.search,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    cursor: req.query.cursor,
  });
  res.json(result);
}));
app.post('/v1/weddings', wrap(async (req: any, res: any) => {
  const supplierOrgId = typeof req.body?.supplier_org_id === 'string' && req.body.supplier_org_id
    ? req.body.supplier_org_id
    : req.user?.supplier_org_id;
  const title = String(req.body?.title || '').trim();
  const weddingDate = String(req.body?.wedding_date || '').trim();

  if (!supplierOrgId) {
    return res.status(400).json({ error: 'supplier_org_id is required' });
  }
  if (!title || !weddingDate) {
    return res.status(400).json({ error: 'title and wedding_date are required' });
  }

  try {
    await EntitlementService.validateAction(
      supplierOrgId,
      'active_weddings',
      1,
      { role: req.user?.role, isPlatformAdmin: req.user?.is_platform_admin }
    );

    const result = await createWedding({
      title,
      weddingDate,
      timezone: req.body?.timezone ? String(req.body.timezone) : undefined,
      status: req.body?.status ? String(req.body.status) : undefined,
      location: req.body?.location ? String(req.body.location) : undefined,
      coupleNames: Array.isArray(req.body?.couple_names)
        ? req.body.couple_names.map((name: unknown) => String(name || ''))
        : [],
      supplierOrgId,
      supplierCategory: req.body?.supplier_category ? String(req.body.supplier_category) : undefined,
      createdByUserId: req.user?.sub || 'demo-user',
    });

    EntitlementService.consumeUsage(supplierOrgId, 'active_weddings', 1);
    return res.status(201).json(result);
  } catch (error: any) {
    if (error?.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    return res.status(400).json({ error: error?.message || 'Aanmaken mislukt.' });
  }
}));
app.patch('/v1/weddings/:id', wrap(async (req: any, res: any) => {
  try {
    const result = await updateWedding({
      weddingId: String(req.params?.id || '').trim(),
      title: typeof req.body?.title === 'string' ? req.body.title : undefined,
      weddingDate: typeof req.body?.wedding_date === 'string' ? req.body.wedding_date : undefined,
      location: typeof req.body?.location === 'string' ? req.body.location : undefined,
      coupleNames: Array.isArray(req.body?.couple_names)
        ? req.body.couple_names.map((name: unknown) => String(name || ''))
        : undefined,
      notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
      contactEmail: typeof req.body?.contact_email === 'string' ? req.body.contact_email : undefined,
      status: typeof req.body?.status === 'string' ? req.body.status : undefined,
      categoryData: req.body?.category_data !== undefined && typeof req.body.category_data === 'object' && !Array.isArray(req.body.category_data) ? req.body.category_data : undefined,
      weddingInfo: req.body?.wedding_info !== undefined && typeof req.body.wedding_info === 'object' && !Array.isArray(req.body.wedding_info) ? req.body.wedding_info : undefined,
      updatedByUserId: req.user?.sub || 'demo-user',
    });
    res.json(result);
  } catch (error: any) {
    const message = String(error?.message || 'Bijwerken mislukt.');
    if (/niet gevonden/i.test(message)) {
      return res.status(404).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
}));
app.get('/v1/weddings/search', wrap(async (req: any, res: any) => {
  const result = await searchWeddings({
    supplierOrgId: req.user.supplier_org_id,
    searchTerm: req.query.q || '',
  });
  res.json(result);
}));
app.get('/v1/weddings/:id', wrap(async (req: any, res: any) => {
  const id = String(req.params?.id || '').trim();
  let wedding = getWeddingById(id);
  if (!wedding) {
    const repo = await findWeddingById(id);
    if (repo) wedding = getWeddingById(id) ?? repo as any;
  }
  if (!wedding) return res.status(404).json({ error: 'Bruiloft niet gevonden.' });
  res.json({ wedding });
}));

// Chat
app.post('/v1/weddings/:id/threads', wrap(ChatController.createThread));
app.get('/v1/weddings/:id/threads', wrap(ChatController.listThreads));
app.get('/v1/threads/:threadId/messages', wrap(ChatController.listMessages));
app.post('/v1/threads/:threadId/messages', wrap(ChatController.send));
app.post('/v1/messages/:messageId/convert-to-task', wrap(ChatController.convertToTask));
app.post('/v1/threads/:threadId/messages/:messageId/reply', wrap(ChatController.reply));
app.post('/v1/messages/:messageId/pin', wrap(ChatController.pin));
app.post('/v1/messages/:messageId/convert-to-appointment', wrap(ChatController.convertToAppointment));
app.post('/v1/messages/:messageId/attach-document', wrap(ChatController.attachDocument));

// Documents
app.post('/v1/documents/presign', wrap(DocumentController.presign));
app.post('/v1/weddings/:weddingId/documents', wrap(DocumentController.create));
app.get('/v1/weddings/:id/documents', wrap(DocumentController.list));
app.post('/v1/documents/:id/share', wrap(DocumentController.share));

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const docMetaFile = path.join(uploadsDir, '_documents.json');

function loadDocMeta(): any[] {
  try { return JSON.parse(fs.readFileSync(docMetaFile, 'utf8')); } catch { return []; }
}
function saveDocMeta(records: any[]): void {
  try { fs.writeFileSync(docMetaFile, JSON.stringify(records, null, 2)); } catch {}
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    cb(null, allowed.includes(file.mimetype));
  },
});
app.post('/v1/weddings/:id/documents/upload', upload.single('file'), wrap(async (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'Geen bestand ontvangen of bestandstype niet toegestaan (pdf, jpg, png).' });
  const doc = await DocumentService.confirmUpload({
    weddingId: String(req.params?.id || ''),
    userId: req.user?.sub || 'demo-user',
    filename: req.file.originalname,
    s3Key: req.file.filename,
    category: String(req.body?.category || 'overig'),
    visibilityScope: 'all_assigned_suppliers',
    sizeBytes: req.file.size,
  });
  const record = {
    id: doc.id,
    weddingId: doc.weddingId,
    userId: doc.userId,
    filename: doc.filename,
    category: doc.category,
    sizeBytes: doc.sizeBytes,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    s3Key: doc.s3Key,
    visibilityScope: doc.visibilityScope,
  };
  const existing = loadDocMeta();
  saveDocMeta([record, ...existing]);
  res.status(201).json({ document: record });
}));
app.get('/v1/uploads/:filename', (req: any, res: any) => {
  const filePath = path.join(uploadsDir, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Bestand niet gevonden.' });
  res.sendFile(filePath);
});

// Multipart upload
app.post('/v1/uploads/initiate', wrap(UploadController.initiate));
app.post('/v1/uploads/:uploadId/parts/:partNumber', wrap(UploadController.uploadPart));
app.post('/v1/uploads/:uploadId/abort', wrap(UploadController.abort));

// Appointments / Calendar
app.get('/v1/weddings/:id/appointments', wrap(CalendarController.list));
app.post('/v1/weddings/:id/appointments', wrap(CalendarController.create));
app.patch('/v1/appointments/:id', wrap(CalendarController.update));
app.delete('/v1/appointments/:id', wrap(CalendarController.cancel));
app.get('/v1/weddings/:id/calendar.ics', wrap(CalendarController.getIcs));
app.get('/v1/weddings/:id/calendar-subscription-url', wrap(CalendarController.getSubscriptionUrl));
app.get('/v1/appointments/:id/calendar.ics', wrap(CalendarController.getSingleEventIcs));

// Push notifications (mobile device token + preferences)
app.post('/v1/notifications/register-token', wrap(NotificationController.registerToken));
app.patch('/v1/notifications/preferences', wrap(NotificationController.updatePreferences));
app.patch('/v1/notifications/mute', wrap(NotificationController.muteWedding));

// Run of Show (ROS)
app.post('/v1/weddings/:id/ros/publish', wrap(ROSController.publish));
app.post('/v1/weddings/:id/ros/draft', wrap(ROSController.saveDraft));
app.get('/v1/weddings/:id/ros/draft', wrap(ROSController.getDraft));
app.get('/v1/weddings/:id/ros/published', wrap(ROSController.getPublished));
app.post('/v1/ros/requests', wrap(ROSController.requestChange));
app.get('/v1/ros/requests/my', wrap(ROSController.listMyRequests));
app.get('/v1/weddings/:id/ros/requests/pending', wrap(ROSController.listPendingRequests));
app.post('/v1/ros/requests/:requestId/resolve', wrap(ROSController.resolveRequest));

app.use((err: any, _req: any, res: any, _next: any) => {
  if (err?.status) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  const detail = process.env.NODE_ENV !== 'production' ? (err?.message || String(err)) : undefined;
  res.status(500).json({ error: 'Internal server error', ...(detail !== undefined ? { detail } : {}) });
});

async function startServer(): Promise<void> {
  await RuntimePersistenceService.init();
  await SupplierDirectoryService.init();

  // Restore uploaded document records from disk (preserves original id, sizeBytes, createdAt)
  for (const rec of loadDocMeta()) {
    try {
      await DocumentService.confirmUpload({
        id: rec.id,
        weddingId: rec.weddingId,
        userId: rec.userId || 'demo-user',
        filename: rec.filename,
        s3Key: rec.s3Key || rec.filename,
        category: rec.category || 'overig',
        visibilityScope: rec.visibilityScope || 'all_assigned_suppliers',
        sizeBytes: rec.sizeBytes,
        createdAt: rec.createdAt,
      });
    } catch {}
  }

  const httpServer = createServer(app);
  RealtimeService.init(httpServer);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[server] Received ${signal}, shutting down...`);

    try {
      await RuntimePersistenceService.flush();
      await RuntimePersistenceService.close();
      await SupplierDirectoryService.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      console.log('[server] Shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('[server] Shutdown failed:', err);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  httpServer.listen(port, () => {
    console.log(`ManagementApp API running on http://localhost:${port}`);
  });
}

void startServer().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
