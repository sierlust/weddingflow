import { CalendarService } from '../services/collaboration.service';

/**
 * Phase 4.4 Calendar Controller
 */
export class CalendarController {
    private static getViewerContext(req: any) {
        const supplierOrgIds = new Set<string>();
        if (typeof req.user?.supplier_org_id === 'string' && req.user.supplier_org_id) {
            supplierOrgIds.add(req.user.supplier_org_id);
        }
        if (Array.isArray(req.user?.orgClaims)) {
            for (const orgId of req.user.orgClaims) {
                if (typeof orgId === 'string' && orgId) {
                    supplierOrgIds.add(orgId);
                }
            }
        }
        return {
            userId: req.user.sub,
            supplierOrgIds: Array.from(supplierOrgIds),
            isOwner: req.user.role === 'owner',
            isPlatformAdmin: !!req.user.is_platform_admin,
        };
    }

    /**
     * 4.4.1 List Appointments
     */
    /** Map backend snake_case fields to the camelCase the mobile client expects */
    private static normalizeMobileAppointment(a: any) {
        if (!a) return a;
        return {
            id: a.id,
            weddingId: a.weddingId ?? a.wedding_id,
            title: a.title,
            startAt: a.startAt ?? a.start_at,
            endAt: a.endAt ?? a.end_at,
            timezone: a.timezone,
            locationOrLink: a.locationOrLink ?? a.location_or_link,
            notes: typeof a.notes === 'object' ? a.notes?.value : a.notes,
            visibilityScope: a.visibilityScope ?? a.visibility_scope,
            createdAt: a.createdAt ?? a.created_at,
        };
    }

    static async list(req: any, res: any) {
        const { id: weddingId } = req.params;
        const appointments = await CalendarService.getAppointments(weddingId, CalendarController.getViewerContext(req));
        return res.json(appointments.map((a: any) => CalendarController.normalizeMobileAppointment(a)));
    }

    /**
     * 4.4.2 Create Appointment
     * Default visibilityScope to 'all_assigned_suppliers' so all suppliers on the wedding see it.
     * Normalise snake_case response fields to camelCase for mobile client compatibility.
     */
    static async create(req: any, res: any) {
        const { id: weddingId } = req.params;
        try {
            const body = { visibilityScope: 'all_assigned_suppliers', ...req.body };
            const appointment = await CalendarService.createAppointment({ weddingId, ...body });
            return res.status(201).json(CalendarController.normalizeMobileAppointment(appointment));
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }

    static async update(req: any, res: any) {
        const { id: appointmentId } = req.params;
        try {
            const appointment = await CalendarService.updateAppointment(appointmentId, req.body || {}, req.user?.sub);
            return res.json(CalendarController.normalizeMobileAppointment(appointment));
        } catch (err: any) {
            const status = err.message?.toLowerCase().includes('not found') ? 404 : 400;
            return res.status(status).json({ error: err.message });
        }
    }

    static async cancel(req: any, res: any) {
        const { id: appointmentId } = req.params;
        try {
            const result = await CalendarService.cancelAppointment(appointmentId, req.user?.sub);
            return res.json(result);
        } catch (err: any) {
            const status = err.message?.toLowerCase().includes('not found') ? 404 : 400;
            return res.status(status).json({ error: err.message });
        }
    }

    /**
     * 4.4.3 iCal Feed
     */
    static async getIcs(req: any, res: any) {
        const { id: weddingId } = req.params;
        const { token } = req.query;
        if (!token) return res.status(401).send('Token required');

        try {
            const ics = await CalendarService.generateIcal(String(token), weddingId);
            res.setHeader('Content-Type', 'text/calendar'); // Requirement 4.4.3
            return res.send(ics);
        } catch (err: any) {
            return res.status(403).send(err.message || 'Forbidden');
        }
    }

    /**
     * 4.4.4 Get Subscription URL
     */
    static async getSubscriptionUrl(req: any, res: any) {
        const { id: weddingId } = req.params;
        const url = await CalendarService.getSubscriptionUrl(weddingId, req.user.sub, CalendarController.getViewerContext(req));
        return res.json({ url });
    }

    /**
     * 4.4.5 Single-event downloadable ICS
     */
    static async getSingleEventIcs(req: any, res: any) {
        const { id: appointmentId } = req.params;
        const { token } = req.query;
        if (!token) return res.status(401).send('Token required');

        try {
            const ics = await CalendarService.generateSingleEventIcal(appointmentId, String(token));
            res.setHeader('Content-Type', 'text/calendar');
            return res.send(ics);
        } catch (err: any) {
            return res.status(403).send(err.message || 'Forbidden');
        }
    }
}
