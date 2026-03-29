import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Animated,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import {
  ArrowLeft, Heart, Info, StickyNote, FolderOpen,
  FileText, ImageIcon, Upload, Archive, Menu, X,
  ClipboardList, Camera, Video, Music2, Flower2,
  MapPin, Scissors, Shirt, Briefcase,
  Users2, CalendarDays, MessageSquare, ChevronRight,
  Car, Mic, UtensilsCrossed, Moon, Zap, Package, Sparkles,
} from 'lucide-react-native';
import { weddingsApi, Wedding } from '../../src/api/weddings';
import { documentsApi, Document } from '../../src/api/documents';
import { supplierApi } from '../../src/api/supplier';

// ─── Datumhulp (dd-mm-yyyy ↔ yyyy-mm-dd) ────────────────────────────────────

function toDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

function toIso(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length < 8) return display;
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

// ─── Categorie-specifieke velden ─────────────────────────────────────────────

type FieldDef = { key: string; label: string; placeholder: string; multiline?: boolean };

const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  Trouwlocatie: [
    { key: 'capacity',   label: 'Capaciteit',          placeholder: 'Max. aantal gasten' },
    { key: 'contact',    label: 'Contactpersoon',      placeholder: 'Naam en telefoonnummer' },
    { key: 'catering',   label: 'Catering',            placeholder: 'Inbegrepen / Extern / Geen' },
    { key: 'stay',       label: 'Overnachting',        placeholder: 'Mogelijk / Niet mogelijk / Aantal kamers' },
    { key: 'parking',    label: 'Parkeren',            placeholder: 'Bijv. gratis parkeerplaats voor 50 auto\'s' },
  ],
  Trouwjurk: [
    { key: 'style',       label: 'Jurk stijl',         placeholder: 'Bijv. A-lijn, ballgown, mermaid' },
    { key: 'size',        label: 'Maten',              placeholder: 'Confectiemaat of pasmaatgegevens' },
    { key: 'fittings',    label: 'Paspunten',          placeholder: 'Data van de paspunten' },
    { key: 'delivery',    label: 'Leveringsdatum',     placeholder: 'Bijv. 01-06-2026' },
    { key: 'accessories', label: 'Accessoires',        placeholder: 'Sluier, schoenen, sieraden...' },
  ],
  Trouwpak: [
    { key: 'style',       label: 'Pak stijl',          placeholder: 'Bijv. slim-fit, klassiek, smoking' },
    { key: 'size',        label: 'Maten',              placeholder: 'Confectiemaat of maatgegevens' },
    { key: 'fittings',    label: 'Paspunten',          placeholder: 'Data van de paspunten' },
    { key: 'delivery',    label: 'Leveringsdatum',     placeholder: 'Bijv. 01-06-2026' },
    { key: 'accessories', label: 'Accessoires',        placeholder: 'Das, pocket square, manchetknopen...' },
  ],
  Trouwfotograaf: [
    { key: 'shotlist',   label: 'Shotlijst',           placeholder: 'Gewenste momenten & must-have foto\'s', multiline: true },
    { key: 'style',      label: 'Fotostijl',           placeholder: 'Bijv. reportage, editorial, klassiek' },
    { key: 'hours',      label: 'Geboekte uren',       placeholder: 'Bijv. 8 uur (ceremonie t/m feest)' },
    { key: 'delivery',   label: 'Leveringstermijn',    placeholder: 'Bijv. 6-8 weken na de bruiloft' },
    { key: 'locations',  label: 'Fotolocaties',        placeholder: 'Bijv. kerk, kasteel, stadspark', multiline: true },
  ],
  Videograaf: [
    { key: 'film_type',  label: 'Soort film',          placeholder: 'Bijv. highlights, documentaire, full-length' },
    { key: 'hours',      label: 'Geboekte uren',       placeholder: 'Bijv. 10 uur' },
    { key: 'delivery',   label: 'Leveringstermijn',    placeholder: 'Bijv. 8-10 weken na de bruiloft' },
    { key: 'drone',      label: 'Drone-opnames',       placeholder: 'Ja / Nee / Omschrijving' },
    { key: 'music',      label: 'Gewenste muziek',     placeholder: 'Stijl of nummers voor de film' },
  ],
  Bloemist: [
    { key: 'bouquet',    label: 'Bruidsboeket',        placeholder: 'Stijl, bloemen en kleuren', multiline: true },
    { key: 'decoration', label: 'Decoratie',           placeholder: 'Tafels, ceremonie-opstelling...', multiline: true },
    { key: 'palette',    label: 'Kleurenpalette',      placeholder: 'Bijv. dusty rose, ivoor, groen' },
    { key: 'trial_date', label: 'Proefopstelling',     placeholder: 'Datum proefopstelling' },
  ],
  Muziek: [
    { key: 'set_times',  label: 'Settijden',           placeholder: 'Bijv. 18:00-19:00 diner, 20:00-00:00 feest', multiline: true },
    { key: 'first_dance',label: 'Openingsdans',        placeholder: 'Artiest & nummer' },
    { key: 'last_song',  label: 'Afsluiting',          placeholder: 'Laatste nummer van de avond' },
    { key: 'no_play',    label: 'Verboden nummers',    placeholder: 'Nummers die absoluut niet mogen', multiline: true },
    { key: 'requests',   label: 'Verzoekjes',          placeholder: 'Toegestaan / Niet toegestaan' },
    { key: 'equipment',  label: 'Geluidsapparatuur',   placeholder: 'Eigen set / gehuurd / locatie' },
  ],
  Trouwauto: [
    { key: 'car_type',   label: 'Type auto',           placeholder: 'Bijv. vintage Rolls-Royce, limousine' },
    { key: 'pickup',     label: 'Ophaaladres',         placeholder: 'Adres en tijdstip' },
    { key: 'dropoff',    label: 'Afleveradres',        placeholder: 'Adres en tijdstip' },
    { key: 'extras',     label: 'Extras',              placeholder: 'Bijv. bloemen op motorkap, champagne' },
    { key: 'driver',     label: 'Chauffeur',           placeholder: 'Naam en contactgegevens' },
  ],
  Weddingplanner: [
    { key: 'package',    label: 'Pakket',              placeholder: 'Bijv. full-service, day-of, partial' },
    { key: 'contact',    label: 'Contactpersoon',      placeholder: 'Naam en telefoonnummer' },
    { key: 'meetings',   label: 'Afspraken',           placeholder: 'Geplande overlegmomenten', multiline: true },
    { key: 'timeline',   label: 'Planning & tijdlijn', placeholder: 'Mijlpalen voor de grote dag', multiline: true },
  ],
  Ceremoniemeester: [
    { key: 'ceremony_type', label: 'Soort ceremonie', placeholder: 'Bijv. civiel, humanistisch, religieus' },
    { key: 'speech',        label: 'Trouwspeech',     placeholder: 'Eigen tekst / Standaard / Afspraken' },
    { key: 'vows',          label: 'Geloften',        placeholder: 'Eigen geloften / Standaardtekst' },
    { key: 'rehearsal',     label: 'Repetitie',       placeholder: 'Datum en tijdstip' },
    { key: 'duration',      label: 'Duur ceremonie',  placeholder: 'Bijv. 30-45 minuten' },
  ],
  Catering: [
    { key: 'menu',        label: 'Menu',               placeholder: 'Voor-, hoofd- en nagerecht', multiline: true },
    { key: 'dietary',     label: 'Dieetwensen',        placeholder: 'Allergieën, vegetarisch, vegan...', multiline: true },
    { key: 'guest_count', label: 'Aantal gasten',      placeholder: 'Bijv. 80' },
    { key: 'tasting',     label: 'Proeverij datum',    placeholder: 'Bijv. 14-03-2026' },
    { key: 'drinks',      label: 'Drankpakket',        placeholder: 'Omschrijving of arrangement naam' },
  ],
  Bruidskapsel: [
    { key: 'hair_style',  label: 'Haarstijl',          placeholder: 'Bijv. opgestoken, golven, vlechten' },
    { key: 'trial_date',  label: 'Proefsessie datum',  placeholder: 'Bijv. 01-08-2026' },
    { key: 'arrival',     label: 'Aanwezigheid',       placeholder: 'Tijdstip aanwezig op trouwdag' },
    { key: 'persons',     label: 'Aantal personen',    placeholder: 'Bijv. bruid + 2 bruidsmeisjes' },
    { key: 'products',    label: 'Producten',          placeholder: 'Eigen producten / locatie-producten' },
  ],
  'Bruids make-up': [
    { key: 'makeup_style',label: 'Make-up stijl',      placeholder: 'Bijv. natural glam, smokey, klassiek' },
    { key: 'trial_date',  label: 'Proefsessie datum',  placeholder: 'Bijv. 01-08-2026' },
    { key: 'arrival',     label: 'Aanwezigheid',       placeholder: 'Tijdstip aanwezig op trouwdag' },
    { key: 'persons',     label: 'Aantal personen',    placeholder: 'Bijv. bruid + bruidsmeisjes' },
    { key: 'products',    label: 'Producten & merken', placeholder: 'Bijv. airbrush, cruelty-free' },
  ],
  Huwelijksnacht: [
    { key: 'hotel',       label: 'Hotel / Verblijf',   placeholder: 'Naam en adres' },
    { key: 'room_type',   label: 'Kamertype',          placeholder: 'Bijv. bruidssuite, deluxe' },
    { key: 'check_in',    label: 'Check-in tijd',      placeholder: 'Bijv. 15:00' },
    { key: 'extras',      label: 'Extras',             placeholder: 'Bijv. champagne, bloemen, ontbijt op bed' },
    { key: 'contact',     label: 'Contactpersoon',     placeholder: 'Naam en telefoonnummer hotel' },
  ],
  Entertainment: [
    { key: 'act_type',    label: 'Soort act',          placeholder: 'Bijv. goochelaar, fotobooth, band' },
    { key: 'duration',    label: 'Duur optreden',      placeholder: 'Bijv. 2 x 45 minuten' },
    { key: 'setup_time',  label: 'Opbouwtijd',         placeholder: 'Hoeveel tijd nodig voor opbouw' },
    { key: 'requirements',label: 'Vereisten',          placeholder: 'Ruimte, stroom, podium...', multiline: true },
  ],
  Verhuur: [
    { key: 'items',       label: 'Te huren items',     placeholder: 'Bijv. tenten, meubels, verlichting', multiline: true },
    { key: 'delivery',    label: 'Bezorging',          placeholder: 'Datum en tijdstip bezorging' },
    { key: 'pickup',      label: 'Ophalen',            placeholder: 'Datum en tijdstip ophalen' },
    { key: 'setup',       label: 'Opbouw service',     placeholder: 'Ja / Nee / Omschrijving' },
    { key: 'deposit',     label: 'Borg',               placeholder: 'Borgbedrag en voorwaarden' },
  ],
};

const CATEGORY_ICON: Record<string, React.ComponentType<any>> = {
  Trouwlocatie:       MapPin,
  Trouwjurk:          Shirt,
  Trouwpak:           Briefcase,
  Trouwfotograaf:     Camera,
  Videograaf:         Video,
  Bloemist:           Flower2,
  Muziek:             Music2,
  Trouwauto:          Car,
  Weddingplanner:     ClipboardList,
  Ceremoniemeester:   Mic,
  Catering:           UtensilsCrossed,
  Bruidskapsel:       Scissors,
  'Bruids make-up':   Sparkles,
  Huwelijksnacht:     Moon,
  Entertainment:      Zap,
  Verhuur:            Package,
};

// ─── Fly-out menu ────────────────────────────────────────────────────────────

const SECTIONS = [
  { key: 'work',   label: 'Mijn inzet',   Icon: ClipboardList },
  { key: 'collab', label: 'Samenwerking', Icon: Users2 },
  { key: 'docs',   label: 'Documenten',   Icon: FolderOpen },
  { key: 'notes',  label: 'Notities',     Icon: StickyNote },
  { key: 'info',   label: 'Informatie',   Icon: Info },
];

function FlyOutMenu({ onSelect }: { onSelect: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  function toggle() {
    Animated.spring(anim, { toValue: open ? 0 : 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    setOpen((o) => !o);
  }

  function select(key: string) {
    toggle();
    onSelect(key);
  }

  return (
    <View style={fab.wrapper} pointerEvents="box-none">
      {SECTIONS.map((sec, i) => {
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -(60 * (i + 1))] });
        const opacity = anim.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });
        return (
          <Animated.View key={sec.key} style={[fab.item, { transform: [{ translateY }], opacity }]}>
            <TouchableOpacity style={fab.itemRow} onPress={() => select(sec.key)}>
              <Text style={fab.itemLabel}>{sec.label}</Text>
              <View style={fab.itemIcon}><sec.Icon size={18} color="#8B6E6E" strokeWidth={1.75} /></View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
      <TouchableOpacity style={[fab.main, open && fab.mainOpen]} onPress={toggle}>
        {open
          ? <X size={20} color="#fff" strokeWidth={2.5} />
          : <Menu size={20} color="#fff" strokeWidth={2} />
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Hoofd scherm ────────────────────────────────────────────────────────────

export default function WeddingDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; data: string }>();
  const scrollRef  = useRef<ScrollView>(null);
  const infoRef    = useRef<View>(null);
  const notesRef   = useRef<View>(null);
  const docsRef    = useRef<View>(null);
  const workRef    = useRef<View>(null);
  const collabRef  = useRef<View>(null);

  const [wedding, setWedding] = useState<Wedding | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [workSaving, setWorkSaving] = useState(false);
  const [workSaved, setWorkSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [archiving, setArchiving] = useState(false);

  const [title, setTitle]               = useState('');
  const [dateDisplay, setDateDisplay]   = useState('');
  const [location, setLocation]         = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes]               = useState('');
  const [categoryData, setCategoryData] = useState<Record<string, string>>({});

  const [supplierCategory, setSupplierCategory] = useState<string | null>(null);

  useEffect(() => {
    // Probeer eerst de meegestuurde data te gebruiken (snelle render),
    // anders haal de bruiloft op via het id-param.
    let weddingId: string | undefined;
    try {
      if (params.data) {
        const initial: Wedding = JSON.parse(params.data as string);
        weddingId = initial.id;
        applyWedding(initial);
      }
    } catch { /* data was ongeldig — val terug op id */ }

    // id is altijd beschikbaar via de route
    weddingId = weddingId ?? (params.id as string);

    if (!weddingId) {
      Alert.alert('Fout', 'Bruiloft kon niet worden geladen.');
      router.back();
      return;
    }

    // Haal altijd de volledige details op (inclusief notities, contact_email, category_data)
    weddingsApi.get(weddingId).then(applyWedding).catch(() => {});
    setDocsLoading(true);
    documentsApi.list(weddingId).then(setDocs).catch(() => {}).finally(() => setDocsLoading(false));
    // Laad leverancierscategorie voor categorie-specifieke sectie
    supplierApi.getProfile().then((p) => setSupplierCategory((p as any).category ?? null)).catch(() => {});
  }, []);

  function applyWedding(w: Wedding) {
    setWedding(w);
    setTitle(w.title ?? '');
    setDateDisplay(toDisplay(w.wedding_date ?? ''));
    setLocation(w.location ?? '');
    setContactEmail(w.contact_email ?? '');
    setNotes(w.notes ?? '');
    setCategoryData(w.category_data ?? {});
  }

  function scrollToRef(ref: React.RefObject<View>) {
    ref.current?.measureLayout(
      scrollRef.current as any,
      (_x, y) => scrollRef.current?.scrollTo({ y: y - 16, animated: true }),
      () => {},
    );
  }

  function handleSectionSelect(key: string) {
    const map: Record<string, any> = {
      info: infoRef, notes: notesRef, docs: docsRef, work: workRef, collab: collabRef,
    };
    scrollToRef(map[key]);
  }

  function confirmSave(action: () => void) {
    Alert.alert(
      'Wijzigingen opslaan',
      'Weet je zeker dat je dit wilt aanpassen?',
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Opslaan', onPress: action },
      ],
    );
  }

  async function saveInfo() {
    if (!wedding) return;
    setSaving(true);
    try {
      const updated = await weddingsApi.update(wedding.id, {
        title: title.trim() || undefined,
        wedding_date: toIso(dateDisplay) || undefined,
        location: location.trim() || undefined,
        contact_email: contactEmail.trim() || undefined,
        notes,
      });
      applyWedding(updated);
    } catch (e: any) {
      Alert.alert('Fout', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    if (!wedding) return;
    setNotesSaving(true);
    setNotesSaved(false);
    try {
      const updated = await weddingsApi.update(wedding.id, { notes });
      applyWedding(updated);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch (e: any) {
      Alert.alert('Fout', e.message);
    } finally {
      setNotesSaving(false);
    }
  }

  async function saveWorkData() {
    if (!wedding) return;
    setWorkSaving(true);
    setWorkSaved(false);
    try {
      const updated = await weddingsApi.update(wedding.id, { category_data: categoryData });
      applyWedding(updated);
      setWorkSaved(true);
      setTimeout(() => setWorkSaved(false), 2500);
    } catch (e: any) {
      Alert.alert('Fout', e.message);
    } finally {
      setWorkSaving(false);
    }
  }

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length || !wedding) return;
    const asset = result.assets[0];
    setUploading(true);
    setUploadProgress(0);
    try {
      const doc = await documentsApi.upload(
        wedding.id,
        { uri: asset.uri, name: asset.name, mimeType: asset.mimeType },
        'overig',
        setUploadProgress,
      );
      setDocs((prev) => [doc, ...prev]);
    } catch (e: any) {
      Alert.alert('Uploadfout', e.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  function handleArchive() {
    Alert.alert(
      'Bruiloft archiveren',
      'Weet je zeker dat je deze bruiloft wilt archiveren? Je kunt dit later ongedaan maken.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Archiveren',
          style: 'destructive',
          onPress: async () => {
            if (!wedding) return;
            setArchiving(true);
            try {
              await weddingsApi.update(wedding.id, { status: 'canceled' });
              router.back();
            } catch (e: any) {
              Alert.alert('Fout', e.message);
            } finally {
              setArchiving(false);
            }
          },
        },
      ],
    );
  }

  if (!wedding) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#8B6E6E" />;

  const isArchived = wedding.status === 'canceled';
  const workFields = supplierCategory ? (CATEGORY_FIELDS[supplierCategory] ?? [
    { key: 'service',      label: 'Omschrijving dienst', placeholder: 'Wat lever jij voor deze bruiloft?', multiline: true },
    { key: 'requirements', label: 'Vereisten & opzet',   placeholder: 'Ruimte, stroom, tijdschema...', multiline: true },
  ]) : null;
  const WorkIcon = supplierCategory ? (CATEGORY_ICON[supplierCategory] ?? Briefcase) : ClipboardList;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} style={s.container} contentContainerStyle={s.content}>

        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={18} color="#8B6E6E" strokeWidth={2} />
          <Text style={s.backText}>Terug</Text>
        </TouchableOpacity>

        {/* Hero */}
        <View style={[s.hero, isArchived && s.heroArchived]}>
          <Heart size={32} color={isArchived ? '#ccc' : '#8B6E6E'} strokeWidth={1.5} />
          <Text style={s.heroTitle}>{wedding.title}</Text>
          {wedding.wedding_date ? (
            <Text style={s.heroDate}>{toDisplay(wedding.wedding_date)}</Text>
          ) : null}
          {wedding.location ? <Text style={s.heroLocation}>{wedding.location}</Text> : null}
          {isArchived ? <Text style={s.archivedBadge}>Gearchiveerd</Text> : null}
        </View>

        {/* Sectie: Mijn inzet (categorie-specifiek) */}
        <View ref={workRef} style={s.section}>
          <View style={s.sectionHeader}>
            <WorkIcon size={16} color="#8B6E6E" strokeWidth={2} />
            <Text style={s.sectionTitle}>{supplierCategory ?? 'Mijn inzet'}</Text>
          </View>

          {!supplierCategory ? (
            <View style={s.emptyHintBox}>
              <Text style={s.emptyHintText}>
                Stel je leverancierstype in via Profiel om hier categorie-specifieke velden te zien.
              </Text>
            </View>
          ) : workFields ? (
            <>
              {workFields.map((field) => (
                <View key={field.key}>
                  <Text style={s.label}>{field.label}</Text>
                  <TextInput
                    style={[s.input, field.multiline && s.textAreaSm]}
                    value={categoryData[field.key] ?? ''}
                    onChangeText={(v) => setCategoryData((prev) => ({ ...prev, [field.key]: v }))}
                    placeholder={field.placeholder}
                    multiline={field.multiline}
                    textAlignVertical={field.multiline ? 'top' : 'center'}
                    placeholderTextColor="#bbb"
                  />
                </View>
              ))}
              <TouchableOpacity
                style={[s.saveBtn, workSaved && s.saveBtnSuccess]}
                onPress={saveWorkData}
                disabled={workSaving}
              >
                {workSaving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.saveBtnText}>{workSaved ? '✓ Opgeslagen' : 'Opslaan'}</Text>
                }
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {/* Sectie: Samenwerking */}
        <View ref={collabRef} style={s.section}>
          <View style={s.sectionHeader}>
            <Users2 size={16} color="#8B6E6E" strokeWidth={2} />
            <Text style={s.sectionTitle}>Samenwerking</Text>
          </View>

          <TouchableOpacity
            style={s.collabCard}
            onPress={() => router.push({
              pathname: '/wedding/chat/[id]',
              params: { id: wedding.id, title: wedding.title },
            } as any)}
            activeOpacity={0.75}
          >
            <View style={[s.collabIconWrap, { backgroundColor: '#fdf5f5' }]}>
              <MessageSquare size={20} color="#8B6E6E" strokeWidth={1.75} />
            </View>
            <View style={s.collabBody}>
              <Text style={s.collabTitle}>Groepschat</Text>
              <Text style={s.collabSub}>Chat met alle leveranciers van deze bruiloft</Text>
            </View>
            <ChevronRight size={18} color="#ccc" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.collabCard}
            onPress={() => router.push({
              pathname: '/wedding/ros/[id]',
              params: { id: wedding.id, title: wedding.title },
            } as any)}
            activeOpacity={0.75}
          >
            <View style={[s.collabIconWrap, { backgroundColor: '#f5f8fd' }]}>
              <ClipboardList size={20} color="#5b7fbf" strokeWidth={1.75} />
            </View>
            <View style={s.collabBody}>
              <Text style={s.collabTitle}>Dagprogramma</Text>
              <Text style={s.collabSub}>Run-of-show voor de trouwdag</Text>
            </View>
            <ChevronRight size={18} color="#ccc" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.collabCard}
            onPress={() => router.push({
              pathname: '/wedding/appointments/[id]',
              params: { id: wedding.id, title: wedding.title },
            } as any)}
            activeOpacity={0.75}
          >
            <View style={[s.collabIconWrap, { backgroundColor: '#f5fdf5' }]}>
              <CalendarDays size={20} color="#5a8a5a" strokeWidth={1.75} />
            </View>
            <View style={s.collabBody}>
              <Text style={s.collabTitle}>Afspraken</Text>
              <Text style={s.collabSub}>Proefsessies, locatiebezoeken en meer</Text>
            </View>
            <ChevronRight size={18} color="#ccc" strokeWidth={2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.collabCard, { marginBottom: 0 }]}
            onPress={() => router.push({
              pathname: '/wedding/invite/[id]',
              params: { id: wedding.id, title: wedding.title },
            } as any)}
            activeOpacity={0.75}
          >
            <View style={[s.collabIconWrap, { backgroundColor: '#fdf5f5' }]}>
              <Users2 size={20} color="#8B6E6E" strokeWidth={1.75} />
            </View>
            <View style={s.collabBody}>
              <Text style={s.collabTitle}>Team & uitnodigingen</Text>
              <Text style={s.collabSub}>Leveranciers en bruidspaar uitnodigen</Text>
            </View>
            <ChevronRight size={18} color="#ccc" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Sectie: Informatie */}
        <View ref={infoRef} style={s.section}>
          <View style={s.sectionHeader}>
            <Info size={16} color="#8B6E6E" strokeWidth={2} />
            <Text style={s.sectionTitle}>Informatie</Text>
          </View>

          <Text style={s.label}>Naam bruidspaar</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="bijv. Emma & Liam" placeholderTextColor="#bbb" />

          <Text style={s.label}>Trouwdatum</Text>
          <TextInput
            style={s.input}
            value={dateDisplay}
            onChangeText={(v) => setDateDisplay(formatDateInput(v))}
            placeholder="dd-mm-yyyy"
            keyboardType="numeric"
            maxLength={10}
            placeholderTextColor="#bbb"
          />

          <Text style={s.label}>Trouwlocatie</Text>
          <TextInput style={s.input} value={location} onChangeText={setLocation} placeholder="bijv. Kasteel De Hooge Vuursche" placeholderTextColor="#bbb" />

          <Text style={s.label}>E-mailadres contactpersoon</Text>
          <TextInput
            style={s.input}
            value={contactEmail}
            onChangeText={setContactEmail}
            placeholder="bruidspaar@email.nl"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor="#bbb"
          />

          <TouchableOpacity style={s.saveBtn} onPress={() => confirmSave(saveInfo)} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Wijzigingen opslaan</Text>}
          </TouchableOpacity>
        </View>

        {/* Sectie: Notities */}
        <View ref={notesRef} style={s.section}>
          <View style={s.sectionHeader}>
            <StickyNote size={16} color="#8B6E6E" strokeWidth={2} />
            <Text style={s.sectionTitle}>Notities</Text>
          </View>
          <TextInput
            style={[s.input, s.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Voeg notities toe over deze bruiloft..."
            multiline
            textAlignVertical="top"
            placeholderTextColor="#bbb"
          />
          <TouchableOpacity
            style={[s.saveBtn, notesSaved && s.saveBtnSuccess]}
            onPress={saveNotes}
            disabled={notesSaving}
          >
            {notesSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.saveBtnText}>{notesSaved ? '✓ Opgeslagen' : 'Notities opslaan'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Sectie: Documenten */}
        <View ref={docsRef} style={s.section}>
          <View style={s.sectionHeader}>
            <FolderOpen size={16} color="#8B6E6E" strokeWidth={2} />
            <Text style={s.sectionTitle}>Documenten</Text>
          </View>
          {docsLoading ? (
            <ActivityIndicator color="#8B6E6E" style={{ marginVertical: 16 }} />
          ) : docs.length === 0 ? (
            <View style={s.docsEmpty}>
              <Text style={s.docsEmptyText}>Nog geen documenten toegevoegd</Text>
            </View>
          ) : (
            docs.map((doc) => (
              <View key={doc.id} style={s.docRow}>
                {/\.pdf$/i.test(doc.filename)
                  ? <FileText size={22} color="#8B6E6E" strokeWidth={1.5} />
                  : <ImageIcon size={22} color="#8B6E6E" strokeWidth={1.5} />
                }
                <View style={{ flex: 1 }}>
                  <Text style={s.docName} numberOfLines={1}>{doc.filename}</Text>
                  <Text style={s.docMeta}>
                    {doc.category}{doc.sizeBytes ? ` · ${(doc.sizeBytes / 1024).toFixed(0)} KB` : ''} · {new Date(doc.createdAt).toLocaleDateString('nl-NL')}
                  </Text>
                </View>
              </View>
            ))
          )}

          {uploading && (
            <View style={s.uploadProgress}>
              <Text style={s.uploadProgressText}>Uploaden... {uploadProgress}%</Text>
              <View style={s.uploadProgressBar}>
                <View style={[s.uploadProgressFill, { width: `${uploadProgress}%` as any }]} />
              </View>
            </View>
          )}

          <TouchableOpacity style={s.uploadBtn} onPress={handleUpload} disabled={uploading}>
            <Upload size={15} color="#8B6E6E" strokeWidth={2} />
            <Text style={s.uploadBtnText}>{uploading ? 'Bezig met uploaden...' : 'Document uploaden'}</Text>
          </TouchableOpacity>
        </View>

        {/* Archiveren */}
        <TouchableOpacity
          style={[s.archiveBtn, isArchived && s.archiveBtnActive]}
          onPress={isArchived ? undefined : handleArchive}
          disabled={archiving || isArchived}
        >
          {archiving
            ? <ActivityIndicator color="#c0392b" />
            : <>
                <Archive size={15} color={isArchived ? '#ccc' : '#c0392b'} strokeWidth={2} />
                <Text style={[s.archiveBtnText, isArchived && s.archiveBtnTextActive]}>
                  {isArchived ? 'Gearchiveerd' : 'Bruiloft archiveren'}
                </Text>
              </>
          }
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <FlyOutMenu onSelect={handleSectionSelect} />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  content: { padding: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { color: '#8B6E6E', fontSize: 16, fontWeight: '500' },
  hero: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, gap: 6 },
  heroArchived: { opacity: 0.5 },
  heroTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', textAlign: 'center', marginTop: 4 },
  heroDate: { fontSize: 15, color: '#8B6E6E' },
  heroLocation: { fontSize: 13, color: '#aaa' },
  archivedBadge: { marginTop: 6, backgroundColor: '#f2f2f2', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, fontSize: 12, color: '#999', fontWeight: '600' },
  section: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  label: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 14, color: '#333' },
  textArea: { minHeight: 140 },
  textAreaSm: { minHeight: 80 },
  saveBtn: { backgroundColor: '#8B6E6E', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 4 },
  saveBtnSuccess: { backgroundColor: '#5a8a5a' },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  emptyHintBox: { backgroundColor: '#fafafa', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#eee' },
  emptyHintText: { color: '#aaa', fontSize: 14, lineHeight: 20 },
  collabCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f4f0f0',
    marginBottom: 2,
  },
  collabIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  collabBody: { flex: 1 },
  collabTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  collabSub: { fontSize: 12, color: '#aaa', marginTop: 2 },

  docsEmpty: { padding: 20, alignItems: 'center' },
  docsEmptyText: { color: '#bbb', fontSize: 14 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  docName: { fontSize: 14, color: '#333', fontWeight: '500' },
  docMeta: { fontSize: 12, color: '#aaa', marginTop: 2 },
  uploadBtn: { borderWidth: 1.5, borderColor: '#8B6E6E', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 12, flexDirection: 'row', gap: 8 },
  uploadBtnText: { color: '#8B6E6E', fontWeight: '600', fontSize: 14 },
  uploadProgress: { marginTop: 10, gap: 6 },
  uploadProgressText: { fontSize: 13, color: '#8B6E6E', fontWeight: '500' },
  uploadProgressBar: { height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  uploadProgressFill: { height: 6, backgroundColor: '#8B6E6E', borderRadius: 3 },
  archiveBtn: { borderWidth: 1.5, borderColor: '#e74c3c', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4, flexDirection: 'row', gap: 8 },
  archiveBtnActive: { borderColor: '#ccc', backgroundColor: '#f9f9f9' },
  archiveBtnText: { color: '#e74c3c', fontWeight: '600', fontSize: 15 },
  archiveBtnTextActive: { color: '#aaa' },
});

const fab = StyleSheet.create({
  wrapper: { position: 'absolute', bottom: 32, right: 24, alignItems: 'center' },
  main: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#8B6E6E', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  mainOpen: { backgroundColor: '#6B4E4E' },
  item: { position: 'absolute', bottom: 0, right: 0, alignItems: 'flex-end' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemLabel: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, fontSize: 13, fontWeight: '600', color: '#333', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  itemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
});
