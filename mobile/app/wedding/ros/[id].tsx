import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Plus, Clock, MapPin, ChevronDown,
  Heart, Utensils, Music2, Truck, Circle, Star,
  CheckCircle,
} from 'lucide-react-native';
import { rosApi, RosItem, RosItemType } from '../../../src/api/ros';

// ─── Kleuren & iconen per type ────────────────────────────────────────────────

const TYPE_CONFIG: Record<RosItemType, { label: string; color: string; bg: string; Icon: React.ComponentType<any> }> = {
  ceremony:  { label: 'Ceremonie',  color: '#8B6E6E', bg: '#fdf4f2', Icon: Heart },
  reception: { label: 'Receptie',   color: '#b5860a', bg: '#fef9ec', Icon: Star },
  dinner:    { label: 'Diner',      color: '#d97706', bg: '#fff7ed', Icon: Utensils },
  party:     { label: 'Feest',      color: '#7c3aed', bg: '#f5f3ff', Icon: Music2 },
  logistics: { label: 'Logistiek',  color: '#0369a1', bg: '#eff6ff', Icon: Truck },
  other:     { label: 'Overig',     color: '#6b7280', bg: '#f9fafb', Icon: Circle },
};

const TYPES: RosItemType[] = ['ceremony', 'reception', 'dinner', 'party', 'logistics', 'other'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function sortItems(items: RosItem[]) {
  return [...items].sort((a, b) => parseTime(a.start_at) - parseTime(b.start_at));
}

function newId() { return `item-${Math.random().toString(36).slice(2, 10)}`; }

// ─── Item kaart ───────────────────────────────────────────────────────────────

function ItemCard({ item, onEdit }: { item: RosItem; onEdit?: () => void }) {
  const cfg = TYPE_CONFIG[item.item_type] ?? TYPE_CONFIG.other;
  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: cfg.color }]}
      onPress={onEdit}
      activeOpacity={onEdit ? 0.7 : 1}
    >
      <View style={[s.cardTypeBadge, { backgroundColor: cfg.bg }]}>
        <cfg.Icon size={13} color={cfg.color} strokeWidth={2} />
        <Text style={[s.cardTypeText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
      <Text style={s.cardTitle}>{item.title}</Text>
      <View style={s.cardMeta}>
        <Clock size={12} color="#aaa" strokeWidth={1.75} />
        <Text style={s.cardMetaText}>{item.start_at} – {item.end_at}</Text>
        {item.location ? (
          <>
            <MapPin size={12} color="#aaa" strokeWidth={1.75} />
            <Text style={s.cardMetaText} numberOfLines={1}>{item.location}</Text>
          </>
        ) : null}
      </View>
      {item.instructions ? (
        <Text style={s.cardInstructions} numberOfLines={2}>{item.instructions}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

// ─── Item formulier modal ─────────────────────────────────────────────────────

function ItemModal({
  visible, initial, onSave, onCancel,
}: {
  visible: boolean;
  initial: Partial<RosItem> | null;
  onSave: (item: RosItem) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startAt, setStartAt] = useState(initial?.start_at ?? '');
  const [endAt, setEndAt] = useState(initial?.end_at ?? '');
  const [itemType, setItemType] = useState<RosItemType>(initial?.item_type ?? 'other');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [showTypeMenu, setShowTypeMenu] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? '');
      setStartAt(initial?.start_at ?? '');
      setEndAt(initial?.end_at ?? '');
      setItemType(initial?.item_type ?? 'other');
      setLocation(initial?.location ?? '');
      setInstructions(initial?.instructions ?? '');
    }
  }, [visible]);

  function formatTimeInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  function handleSave() {
    if (!title.trim()) { Alert.alert('Fout', 'Vul een titel in.'); return; }
    if (!/^\d{2}:\d{2}$/.test(startAt)) { Alert.alert('Fout', 'Vul een geldig starttijd in (HH:MM).'); return; }
    if (!/^\d{2}:\d{2}$/.test(endAt)) { Alert.alert('Fout', 'Vul een geldig eindtijd in (HH:MM).'); return; }
    onSave({
      id: initial?.id ?? newId(),
      sort_index: initial?.sort_index ?? 0,
      start_at: startAt,
      end_at: endAt,
      title: title.trim(),
      item_type: itemType,
      location: location.trim() || null,
      owner_supplier_org_id: null,
      instructions: instructions.trim(),
    });
  }

  const cfg = TYPE_CONFIG[itemType];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={m.container}>
        <View style={m.header}>
          <Text style={m.headerTitle}>{initial?.id ? 'Item bewerken' : 'Nieuw item'}</Text>
          <TouchableOpacity onPress={onCancel}><Text style={m.cancel}>Annuleren</Text></TouchableOpacity>
        </View>

        <Text style={m.label}>Titel *</Text>
        <TextInput style={m.input} value={title} onChangeText={setTitle} placeholder="Bijv. Ceremonie aanvang" placeholderTextColor="#bbb" />

        <View style={m.row}>
          <View style={{ flex: 1 }}>
            <Text style={m.label}>Starttijd *</Text>
            <TextInput
              style={m.input}
              value={startAt}
              onChangeText={(v) => setStartAt(formatTimeInput(v))}
              placeholder="HH:MM"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={m.label}>Eindtijd *</Text>
            <TextInput
              style={m.input}
              value={endAt}
              onChangeText={(v) => setEndAt(formatTimeInput(v))}
              placeholder="HH:MM"
              placeholderTextColor="#bbb"
              keyboardType="numeric"
              maxLength={5}
            />
          </View>
        </View>

        <Text style={m.label}>Type</Text>
        <TouchableOpacity style={[m.input, m.picker, { borderColor: cfg.color }]} onPress={() => setShowTypeMenu(!showTypeMenu)}>
          <cfg.Icon size={14} color={cfg.color} strokeWidth={2} />
          <Text style={[m.pickerText, { color: cfg.color }]}>{cfg.label}</Text>
          <ChevronDown size={14} color={cfg.color} strokeWidth={2} />
        </TouchableOpacity>
        {showTypeMenu && (
          <View style={m.typeMenu}>
            {TYPES.map((t) => {
              const c = TYPE_CONFIG[t];
              return (
                <TouchableOpacity key={t} style={m.typeOption} onPress={() => { setItemType(t); setShowTypeMenu(false); }}>
                  <c.Icon size={14} color={c.color} strokeWidth={2} />
                  <Text style={[m.typeOptionText, { color: c.color }]}>{c.label}</Text>
                  {itemType === t && <CheckCircle size={14} color={c.color} strokeWidth={2} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={m.label}>Locatie</Text>
        <TextInput style={m.input} value={location} onChangeText={setLocation} placeholder="Bijv. Ceremoniaal" placeholderTextColor="#bbb" />

        <Text style={m.label}>Instructies</Text>
        <TextInput
          style={[m.input, m.textArea]}
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Bijzonderheden voor dit tijdblok..."
          placeholderTextColor="#bbb"
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={m.saveBtn} onPress={handleSave}>
          <Text style={m.saveBtnText}>{initial?.id ? 'Opslaan' : 'Toevoegen'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ─── Hoofd scherm ─────────────────────────────────────────────────────────────

export default function RosScreen() {
  const router = useRouter();
  const { id: weddingId, title: weddingTitle } = useLocalSearchParams<{ id: string; title: string }>();

  const [tab, setTab] = useState<'published' | 'draft'>('published');
  const [publishedItems, setPublishedItems] = useState<RosItem[]>([]);
  const [draftItems, setDraftItems] = useState<RosItem[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<RosItem> | null>(null);

  const load = useCallback(async () => {
    if (!weddingId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [draft, published] = await Promise.all([
        rosApi.getDraft(weddingId),
        rosApi.getPublished(weddingId),
      ]);
      setDraftItems(sortItems(draft?.draft_json ?? []));
      if (published) {
        setPublishedItems(sortItems(published.snapshot_json ?? []));
        setPublishedAt(published.published_at);
        setVersionNumber(published.version_number);
      }
    } catch {
      // Stil falen — lege staat tonen
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  async function saveDraft(items: RosItem[]) {
    if (!weddingId) return;
    setSaving(true);
    try {
      await rosApi.saveDraft(weddingId, items);
    } catch (e: any) {
      Alert.alert('Fout', e.message ?? 'Opslaan mislukt.');
    } finally {
      setSaving(false);
    }
  }

  function handleAddItem() {
    setEditingItem(null);
    setModalVisible(true);
  }

  function handleEditItem(item: RosItem) {
    setEditingItem(item);
    setModalVisible(true);
  }

  function handleSaveItem(item: RosItem) {
    setModalVisible(false);
    const existing = draftItems.findIndex((d) => d.id === item.id);
    let updated: RosItem[];
    if (existing >= 0) {
      updated = [...draftItems];
      updated[existing] = item;
    } else {
      updated = [...draftItems, { ...item, sort_index: draftItems.length }];
    }
    updated = sortItems(updated);
    setDraftItems(updated);
    saveDraft(updated);
  }

  function handleDeleteItem(id: string) {
    Alert.alert('Verwijderen', 'Wil je dit item verwijderen?', [
      { text: 'Annuleren', style: 'cancel' },
      {
        text: 'Verwijderen', style: 'destructive',
        onPress: () => {
          const updated = draftItems.filter((d) => d.id !== id);
          setDraftItems(updated);
          saveDraft(updated);
        },
      },
    ]);
  }

  async function handlePublish() {
    if (!weddingId) return;
    Alert.alert(
      'Dagprogramma publiceren',
      'Alle leveranciers ontvangen het bijgewerkte programma.',
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Publiceer',
          onPress: async () => {
            setPublishing(true);
            try {
              const version = await rosApi.publish(weddingId, 'Bijgewerkt via app');
              setPublishedItems(sortItems(version.snapshot_json ?? []));
              setPublishedAt(version.published_at);
              setVersionNumber(version.version_number);
              setTab('published');
              Alert.alert('Gepubliceerd', `Versie ${version.version_number} is nu live voor alle leveranciers.`);
            } catch (e: any) {
              Alert.alert('Fout', e.message ?? 'Publiceren mislukt.');
            } finally {
              setPublishing(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#8B6E6E" />
      </View>
    );
  }

  const activeItems = tab === 'published' ? publishedItems : draftItems;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle} numberOfLines={1}>{weddingTitle ?? 'Dagprogramma'}</Text>
          {versionNumber && tab === 'published' ? (
            <Text style={s.headerSub}>Versie {versionNumber} · {publishedAt ? new Date(publishedAt).toLocaleDateString('nl-NL') : ''}</Text>
          ) : (
            <Text style={s.headerSub}>{tab === 'draft' ? `${draftItems.length} items in concept` : 'Gepubliceerd programma'}</Text>
          )}
        </View>
        {saving && <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />}
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === 'published' && s.tabActive]} onPress={() => setTab('published')}>
          <Text style={[s.tabText, tab === 'published' && s.tabTextActive]}>Gepubliceerd</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === 'draft' && s.tabActive]} onPress={() => setTab('draft')}>
          <Text style={[s.tabText, tab === 'draft' && s.tabTextActive]}>Concept</Text>
          {draftItems.length > 0 && <View style={s.badge}><Text style={s.badgeText}>{draftItems.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* Lijst */}
      <ScrollView contentContainerStyle={s.scroll}>
        {activeItems.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyTitle}>
              {tab === 'published' ? 'Nog geen gepubliceerd programma' : 'Concept is leeg'}
            </Text>
            <Text style={s.emptySub}>
              {tab === 'published'
                ? 'Stel een dagprogramma op in het concept-tabblad en publiceer het.'
                : 'Voeg tijdblokken toe via de knop hieronder.'}
            </Text>
          </View>
        ) : (
          activeItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={tab === 'draft' ? () => handleEditItem(item) : undefined}
            />
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Draft acties */}
      {tab === 'draft' && (
        <View style={s.footer}>
          <TouchableOpacity style={s.addBtn} onPress={handleAddItem}>
            <Plus size={18} color="#8B6E6E" strokeWidth={2.5} />
            <Text style={s.addBtnText}>Tijdblok toevoegen</Text>
          </TouchableOpacity>
          {draftItems.length > 0 && (
            <TouchableOpacity style={s.publishBtn} onPress={handlePublish} disabled={publishing}>
              {publishing
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.publishBtnText}>Publiceer voor alle leveranciers</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      )}

      <ItemModal
        visible={modalVisible}
        initial={editingItem}
        onSave={handleSaveItem}
        onCancel={() => setModalVisible(false)}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#8B6E6E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerInfo: { flex: 1 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },

  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0eded' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, gap: 6 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#8B6E6E' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#aaa' },
  tabTextActive: { color: '#8B6E6E', fontWeight: '700' },
  badge: { backgroundColor: '#8B6E6E', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  scroll: { padding: 16, gap: 10 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderLeftWidth: 4, borderLeftColor: '#8B6E6E',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1, gap: 6,
  },
  cardTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  cardTypeText: { fontSize: 11, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 12, color: '#888' },
  cardInstructions: { fontSize: 13, color: '#aaa', fontStyle: 'italic', lineHeight: 18 },

  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#aaa' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingHorizontal: 32 },

  footer: { padding: 16, paddingBottom: 32, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0eded', gap: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#8B6E6E', borderRadius: 10, padding: 13 },
  addBtnText: { color: '#8B6E6E', fontWeight: '600', fontSize: 15 },
  publishBtn: { backgroundColor: '#8B6E6E', borderRadius: 10, padding: 14, alignItems: 'center' },
  publishBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const m = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  cancel: { color: '#8B6E6E', fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 13, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 14, color: '#333' },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerText: { flex: 1, fontSize: 15, fontWeight: '600' },
  typeMenu: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#eee', marginTop: -8, marginBottom: 14, overflow: 'hidden' },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#f4f0f0' },
  typeOptionText: { flex: 1, fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: '#8B6E6E', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
