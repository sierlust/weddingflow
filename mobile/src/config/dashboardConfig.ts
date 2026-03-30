/**
 * Dashboard configuratie per leverancierstype.
 *
 * WEDDING_INFO_FIELDS  — alle globale bruiloftsvariabelen die bestaan
 * DASHBOARD_CONFIG     — per categorie: welke velden en secties worden getoond
 *
 * Geen rechtensysteem: variabelen worden simpelweg niet gerenderd
 * als ze niet in de config staan.
 */

export type WeddingInfoFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  group: string;
};

// ─── Master lijst van alle globale bruiloftsvariabelen ───────────────────────

export const WEDDING_INFO_FIELDS: WeddingInfoFieldDef[] = [
  // Tijdlijn
  { key: 'ceremony_time', label: 'Aanvang ceremonie',  placeholder: 'bijv. 14:00',             group: 'Tijdlijn' },
  { key: 'dinner_time',   label: 'Aanvang diner',       placeholder: 'bijv. 17:30',             group: 'Tijdlijn' },
  { key: 'party_time',    label: 'Aanvang feest',        placeholder: 'bijv. 19:00',             group: 'Tijdlijn' },
  { key: 'end_time',      label: 'Einde feest',          placeholder: 'bijv. 01:00',             group: 'Tijdlijn' },

  // Gasten & logistiek
  { key: 'guest_count',     label: 'Aantal gasten',             placeholder: 'bijv. 80',                        group: 'Gasten' },
  { key: 'dietary_overview',label: 'Dieetwensen & allergieën',  placeholder: '3x vegetarisch, 1x vegan...',     group: 'Gasten', multiline: true },
  { key: 'dress_code',      label: 'Dresscode',                 placeholder: 'bijv. Black tie / Smart casual',  group: 'Gasten' },

  // Stijl & sfeer
  { key: 'theme',         label: 'Thema / Stijl',      placeholder: 'bijv. Bohemian, Garden party, Klassiek', group: 'Stijl' },
  { key: 'color_palette', label: 'Kleurenpalette',      placeholder: 'bijv. Dusty rose, Ivoor, Saliegroen',   group: 'Stijl' },

  // Muziek
  { key: 'opening_dance', label: 'Openingsdans',        placeholder: 'Artiest & nummer',         group: 'Muziek' },
  { key: 'music_style',   label: 'Muziekstijl feest',   placeholder: 'bijv. Pop, R&B, jaren 90', group: 'Muziek' },

  // Ceremonie
  { key: 'ceremony_type',     label: 'Soort ceremonie',     placeholder: 'bijv. Burgerlijk, Humanistisch, Religieus', group: 'Ceremonie' },
  { key: 'ceremony_location', label: 'Ceremonielocatie',    placeholder: 'Als anders dan de feestlocatie',             group: 'Ceremonie' },
  { key: 'vows_type',         label: 'Geloften',            placeholder: 'Eigen tekst / Standaard / Combinatie',       group: 'Ceremonie' },
];

// ─── Typen ────────────────────────────────────────────────────────────────────

export type CollabItem = 'chat' | 'ros' | 'appointments' | 'team';
export type SectionKey  = 'work' | 'collab' | 'docs' | 'notes' | 'info';

export type SupplierDashboardConfig = {
  /** Leesbare naam */
  label: string;
  /** Welke wedding_info-keys worden getoond in de Informatie-sectie */
  infoFields: string[];
  /** Welke navigatie-secties worden getoond */
  sections: SectionKey[];
  /** Welke kaarten in de Samenwerking-sectie worden getoond */
  collabItems: CollabItem[];
};

const ALL_SECTIONS: SectionKey[]  = ['work', 'collab', 'docs', 'notes', 'info'];
const ALL_COLLAB: CollabItem[]    = ['chat', 'ros', 'appointments', 'team'];

// ─── Config per leverancierstype ─────────────────────────────────────────────

export const DASHBOARD_CONFIG: Record<string, SupplierDashboardConfig> = {

  // ── Weddingplanner / Ceremoniemeester: alles zichtbaar ──────────────────────
  Weddingplanner: {
    label: 'Weddingplanner',
    infoFields: WEDDING_INFO_FIELDS.map(f => f.key),
    sections: ALL_SECTIONS,
    collabItems: ALL_COLLAB,
  },
  Ceremoniemeester: {
    label: 'Ceremoniemeester',
    infoFields: [
      'ceremony_type', 'ceremony_location', 'vows_type',
      'ceremony_time', 'dinner_time',
      'guest_count', 'dress_code',
    ],
    sections: ALL_SECTIONS,
    collabItems: ALL_COLLAB,
  },

  // ── Beeld & geluid ────────────────────────────────────────────────────────
  Fotograaf: {
    label: 'Fotograaf',
    infoFields: [
      'ceremony_time', 'dinner_time', 'party_time', 'end_time',
      'guest_count', 'dress_code', 'theme', 'color_palette',
    ],
    sections: ALL_SECTIONS,
    collabItems: ALL_COLLAB,
  },
  Videograaf: {
    label: 'Videograaf',
    infoFields: [
      'ceremony_time', 'dinner_time', 'party_time', 'end_time',
      'guest_count', 'dress_code', 'opening_dance', 'theme', 'color_palette',
    ],
    sections: ALL_SECTIONS,
    collabItems: ALL_COLLAB,
  },
  Muziek: {
    label: 'DJ / Muziek',
    infoFields: [
      'ceremony_time', 'dinner_time', 'party_time', 'end_time',
      'guest_count', 'dress_code', 'opening_dance', 'music_style',
    ],
    sections: ALL_SECTIONS,
    collabItems: ['chat', 'ros', 'appointments'],
  },
  Verlichting: {
    label: 'Verlichting',
    infoFields: [
      'ceremony_time', 'dinner_time', 'party_time', 'end_time',
      'color_palette', 'theme',
    ],
    sections: ALL_SECTIONS,
    collabItems: ['chat', 'ros', 'appointments'],
  },

  // ── Styling & beauty ──────────────────────────────────────────────────────
  Bloemist: {
    label: 'Bloemist',
    infoFields: [
      'ceremony_time', 'guest_count',
      'color_palette', 'theme', 'ceremony_location',
    ],
    sections: ['work', 'docs', 'notes', 'info'],
    collabItems: ['chat', 'appointments'],
  },
  Styling: {
    label: 'Styling',
    infoFields: [
      'ceremony_time', 'dress_code', 'color_palette', 'theme',
    ],
    sections: ['work', 'docs', 'notes', 'info'],
    collabItems: ['chat', 'appointments'],
  },
  Beauty: {
    label: 'Beauty',
    infoFields: [
      'ceremony_time', 'dress_code', 'color_palette',
    ],
    sections: ['work', 'docs', 'notes', 'info'],
    collabItems: ['chat', 'appointments'],
  },

  // ── Eten & drinken ────────────────────────────────────────────────────────
  Catering: {
    label: 'Catering',
    infoFields: [
      'ceremony_time', 'dinner_time', 'party_time', 'end_time',
      'guest_count', 'dietary_overview', 'dress_code',
    ],
    sections: ALL_SECTIONS,
    collabItems: ['chat', 'ros', 'appointments'],
  },
  Taart: {
    label: 'Taart',
    infoFields: [
      'dinner_time', 'party_time',
      'guest_count', 'dietary_overview', 'color_palette', 'theme',
    ],
    sections: ['work', 'docs', 'notes', 'info'],
    collabItems: ['chat', 'appointments'],
  },

  // ── Locatie & logistiek ───────────────────────────────────────────────────
  Locatie: {
    label: 'Locatie',
    infoFields: [
      'ceremony_time', 'dinner_time', 'party_time', 'end_time',
      'guest_count', 'dietary_overview', 'dress_code', 'theme',
    ],
    sections: ALL_SECTIONS,
    collabItems: ALL_COLLAB,
  },

  // ── Standaard (onbekend type) ─────────────────────────────────────────────
  default: {
    label: 'Overzicht',
    infoFields: WEDDING_INFO_FIELDS.map(f => f.key),
    sections: ALL_SECTIONS,
    collabItems: ALL_COLLAB,
  },
};

/** Geeft de config voor een leverancierstype terug, valt terug op 'default'. */
export function getDashboardConfig(category: string | null): SupplierDashboardConfig {
  if (!category) return DASHBOARD_CONFIG.default;
  return DASHBOARD_CONFIG[category] ?? DASHBOARD_CONFIG.default;
}

/** Geeft de FieldDef-objecten terug die voor deze config relevant zijn. */
export function getInfoFields(config: SupplierDashboardConfig): WeddingInfoFieldDef[] {
  return WEDDING_INFO_FIELDS.filter(f => config.infoFields.includes(f.key));
}
