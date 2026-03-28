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
    private static guests: Map<string, Guest> = new Map();

    static async getGuests(weddingId: string): Promise<Guest[]> {
        return Array.from(this.guests.values())
            .filter(g => g.weddingId === weddingId)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
        this.guests.set(id, guest);
        return guest;
    }

    static async updateGuest(guestId: string, patch: {
        status?: Guest['status'];
        name?: string;
        email?: string;
        address?: string;
        plusOnes?: number;
    }): Promise<Guest> {
        const guest = this.guests.get(guestId);
        if (!guest) throw Object.assign(new Error('Gast niet gevonden'), { status: 404 });
        const statusChanged = patch.status !== undefined && patch.status !== guest.status;
        const updated: Guest = {
            ...guest,
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
            ...(patch.email !== undefined ? { email: patch.email.trim().toLowerCase() } : {}),
            ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
            ...(patch.plusOnes !== undefined ? { plusOnes: Math.max(0, Number(patch.plusOnes) || 0) } : {}),
            ...(statusChanged ? { respondedAt: new Date().toISOString() } : {}),
        };
        this.guests.set(guestId, updated);
        return updated;
    }

    static async deleteGuest(guestId: string): Promise<void> {
        if (!this.guests.has(guestId)) throw Object.assign(new Error('Gast niet gevonden'), { status: 404 });
        this.guests.delete(guestId);
    }

    static clearStateForTests(): void {
        this.guests.clear();
    }
}
