/**
 * Phase 3.2 Dashboard UI Component Logic
 */
export class DashboardComponent {
    private weddings: any[] = [];
    private filters = {
        datePreset: 'all', // '7', '30', '90', 'all'
        status: 'all',     // 'invited', 'active', 'completed', 'all'
        myWeddings: false
    };
    private filterRevision = 0;

    setWeddings(weddings: any[]) {
        this.weddings = [...weddings];
    }

    setFilters(nextFilters: Partial<typeof this.filters>) {
        this.filters = { ...this.filters, ...nextFilters };
        this.filterRevision += 1;
    }

    getFilters() {
        return { ...this.filters };
    }

    getFilterRevision() {
        return this.filterRevision;
    }

    /**
     * 3.2.1 Component Render Data
     */
    getRenderData() {
        if (this.weddings.length === 0) {
            return this.getEmptyState(); // 3.2.6
        }
        return this.applyFiltersAndSort(this.weddings);
    }

    /**
     * 3.2.2 - 3.2.5 Filters & Sorting
     */
    private applyFiltersAndSort(data: any[]) {
        return data
            .filter(w => {
                // 3.2.2 Date Presets
                if (this.filters.datePreset !== 'all') {
                    const days = parseInt(this.filters.datePreset);
                    const limit = new Date();
                    limit.setDate(limit.getDate() + days);
                    if (new Date(w.wedding_date) > limit) return false;
                }
                // 3.2.3 Status Filter
                if (this.filters.status !== 'all' && w.status !== this.filters.status) return false;
                // 3.2.4 My Weddings Toggle
                if (this.filters.myWeddings && !w.is_assigned_to_me) return false;
                return true;
            })
            .sort((a, b) => {
                // 3.2.5 Default sort: soonest date, then last activity
                const dateDiff = new Date(a.wedding_date).getTime() - new Date(b.wedding_date).getTime();
                if (dateDiff !== 0) return dateDiff;
                return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
            });
    }

    /**
     * 3.2.8 Real-time Badge Updates (WebSocket listener simulation)
     */
    handleNewMessage(weddingId: string) {
        const wedding = this.weddings.find(w => w.id === weddingId);
        if (wedding) {
            wedding.unread_messages = (wedding.unread_messages || 0) + 1;
            wedding._lastRealtimeUpdate = Date.now();
            // 3.2.9: Incremental update without resetting filter state.
        }
    }

    /**
     * 3.2.6 Empty State
     */
    private getEmptyState() {
        return {
            illustration: 'empty_dashboard.svg',
            title: 'Geen bruiloften gevonden',
            description: 'Begin met het instellen van je leveranciersprofiel om uitnodigingen te ontvangen.',
            cta: 'Stel profiel in'
        };
    }

    /**
     * 3.2.7 Loader Skeleton
     */
    getSkeleton() {
        return [1, 2, 3].map(i => ({ id: `skeleton-${i}`, loading: true }));
    }
}
