import { GuestService } from '../services/guest.service';

export class GuestController {
    static async list(req: any, res: any) {
        const { id: weddingId } = req.params;
        const guests = await GuestService.getGuests(weddingId);
        return res.json({ guests });
    }

    static async create(req: any, res: any) {
        const { id: weddingId } = req.params;
        const { name, email, address, plusOnes } = req.body ?? {};
        const guest = await GuestService.addGuest(weddingId, { name, email, address, plusOnes });
        return res.status(201).json(guest);
    }

    static async update(req: any, res: any) {
        const { guestId } = req.params;
        const { status, name, email, address, plusOnes } = req.body ?? {};
        const guest = await GuestService.updateGuest(guestId, { status, name, email, address, plusOnes });
        return res.json(guest);
    }

    static async remove(req: any, res: any) {
        const { guestId } = req.params;
        await GuestService.deleteGuest(guestId);
        return res.json({ success: true });
    }
}
