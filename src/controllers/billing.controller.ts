import { BillingService } from '../services/billing.service';

/**
 * Phase 6.2 Billing Controller
 */
export class BillingController {
    /**
     * 6.2.2 Stripe Webhook Endpoint
     */
    static async webhook(req: any, res: any) {
        const sig = req.headers['stripe-signature'];
        try {
            await BillingService.handleWebhook(req.body, sig);
            return res.json({ received: true });
        } catch (err: any) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    /**
     * 6.2.3 / 6.2.4 Change Plan
     */
    static async changePlan(req: any, res: any) {
        const { planId, immediate, confirmDowngradeNow } = req.body;
        const orgId = req.user.supplier_org_id; // SA only via middleware
        const role = String(req.user?.role || '');
        const isSupplierAdmin = role === 'admin' || role === 'supplier_admin';
        const isPlatformAdmin = Boolean(req.user?.is_platform_admin);

        if (!isSupplierAdmin && !isPlatformAdmin) {
            return res.status(403).json({ error: 'Forbidden: supplier admin role required.' });
        }

        try {
            const result = await BillingService.updatePlan(
                orgId,
                planId,
                immediate !== false,
                { confirmDowngradeNow: Boolean(confirmDowngradeNow) }
            );
            return res.json(result);
        } catch (err: any) {
            return res.status(400).json({ error: err.message });
        }
    }
}
