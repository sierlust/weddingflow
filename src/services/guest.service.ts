import * as GuestsRepo from '../repositories/guests.repo';

export interface Guest {
    id: string;
    weddingId: string;
    name: string;
    email: string;
    address: string;
    plusOnes: number;
    status: 'pending' | 'accepted' | 'declined' | 'maybe';
    rsvpToken: string;
    respondedAt?: string;
    createdAt: string;
}

export class GuestService {
    static async getGuests(weddingId: string): Promise<Guest[]> {
        return GuestsRepo.findGuestsByWedding(weddingId);
    }

    static async addGuest(weddingId: string, data: {
        name: string;
        email: string;
        address?: string;
        plusOnes?: number;
    }): Promise<Guest> {
        if (!data.name?.trim()) throw Object.assign(new Error('Naam is verplicht'), { status: 400 });
        if (!data.email?.trim()) throw Object.assign(new Error('E-mail is verplicht'), { status: 400 });
        const id = `guest-${Math.random().toString(36).slice(2, 10)}`;
        const guest: Guest = {
            id,
            weddingId,
            name: data.name.trim(),
            email: data.email.trim().toLowerCase(),
            address: data.address?.trim() || '',
            plusOnes: Math.max(0, Number(data.plusOnes) || 0),
            status: 'pending',
            rsvpToken: `rsvp-${Math.random().toString(36).slice(2, 10)}`,
            createdAt: new Date().toISOString(),
        };
        return GuestsRepo.createGuest(guest);
    }

    static async updateGuest(guestId: string, patch: {
        status?: Guest['status'];
        name?: string;
        email?: string;
        address?: string;
        plusOnes?: number;
    }): Promise<Guest> {
        const guest = await GuestsRepo.findGuestById(guestId);
        if (!guest) throw Object.assign(new Error('Gast niet gevonden'), { status: 404 });
        const statusChanged = patch.status !== undefined && patch.status !== guest.status;
        const updatedPatch: Partial<Guest> = {
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.email !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
            ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
            ...(patch.plusOnes !== undefined ? { plusOnes: Math.max(0, Number(patch.plusOnes) || 0) } : {}),
            ...(statusChanged ? { respondedAt: new Date().toISOString() } : {}),
        };
        const updated = await GuestsRepo.updateGuest(guestId, updatedPatch);
        return updated!;
    }

    static async deleteGuest(guestId: string): Promise<void> {
        const removed = await GuestsRepo.removeGuest(guestId);
        if (!removed) throw Object.assign(new Error('Gast niet gevonden'), { status: 404 });
    }

    static clearStateForTests(): void {
        GuestsRepo._clearGuestsStoreForTests();
    }
}
