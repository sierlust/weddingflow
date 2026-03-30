import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Plus, CalendarDays, Clock, MapPin,
  StickyNote, X, Pencil, Trash2,
} from 'lucide-react-native';
import { appointmentsApi, Appointment, NewAppointment } from '../../../src/api/appointments';

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

/** Zet "dd-mm-yyyy HH:MM" om naar ISO string, of geeft null terug bij ongeldige input */
function parseDateTime(dateStr: string, timeStr: string): string | null {
  // dateStr: dd-mm-yyyy
  const dateParts = dateStr.replace(/\D/g, '');
  if (dateParts.length < 8) return null;
  const day = dateParts.slice(0, 2);
  const month = dateParts.slice(2, 4);
  const year = dateParts.slice(4, 8);

  // timeStr: HH:MM
  const timeParts = timeStr.replace(/\D/g, '');
  if (timeParts.length < 4) return null;
  const hour = timeParts.slice(0, 2);
  const minute = timeParts.slice(2, 4);

  const iso = `${year}-${month}-${day}T${hour}:${minute}:00.000Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return iso;
}

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function isoToTimeInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

// ─── Afspraak formulier modal ─────────────────────────────────────────────────

interface FormState {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  locationOrLink: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  title: '', startDate: '', startTime: '', endDate: '', endTime: '',
  locationOrLink: '', notes: '',
};

function appointmentToForm(a: Appointment): FormState {
  return {
    title: a.title,
    startDate: isoToDateInput(a.startAt),
    startTime: isoToTimeInput(a.startAt),
    endDate: isoToDateInput(a.endAt),
    endTime: isoToTimeInput(a.endAt),
    locationOrLink: a.locationOrLink ?? '',
    notes: a.notes ?? '',
  };
}

interface AppointmentModalProps {
  visible: boolean;
  editing: Appointment | null;
  onClose: () => void;
  onSave: (data: NewAppointment, id?: string) => Promise<void>;
}

function AppointmentModal({ visible, editing, onClose, onSave }: AppointmentModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(editing ? appointmentToForm(editing) : EMPTY_FORM);
    }
  }, [visible, editing]);

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      Alert.alert('Vereist', 'Voer een titel in voor de afspraak.');
      return;
    }
    const startAt = parseDateTime(form.startDate, form.startTime);
    const endAt = parseDateTime(form.endDate, form.endTime);
    if (!startAt) {
      Alert.alert('Ongeldige datum/tijd', 'Controleer start datum en tijd (dd-mm-yyyy, HH:MM).');
      return;
    }
    if (!endAt) {
      Alert.alert('Ongeldige datum/tijd', 'Controleer eind datum en tijd (dd-mm-yyyy, HH:MM).');
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      Alert.alert('Ongeldige tijd', 'Einddatum/tijd moet na de startdatum/tijd liggen.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        startAt,
        endAt,
        locationOrLink: form.locationOrLink.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }, editing?.id);
      onClose();
    } catch (e: any) {
      Alert.alert('Fout', e.message ?? 'Opslaan mislukt.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={m.header}>
          <Text style={m.headerTitle}>{editing ? 'Afspraak bewerken' : 'Nieuwe afspraak'}</Text>
          <TouchableOpacity onPress={onClose} style={m.closeBtn}>
            <X size={22} color="#666" strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <ScrollView style={m.body} contentContainerStyle={m.bodyContent} keyboardShouldPersistTaps="handled">

          <Text style={m.label}>Titel *</Text>
          <TextInput
            style={m.input}
            value={form.title}
            onChangeText={(v) => set('title', v)}
            placeholder="Bijv. Proefsessie, Locatiebezoek..."
            placeholderTextColor="#bbb"
          />

          <Text style={m.label}>Start datum</Text>
          <TextInput
            style={m.input}
            value={form.startDate}
            onChangeText={(v) => set('startDate', formatDateInput(v))}
            placeholder="dd-mm-yyyy"
            keyboardType="numeric"
            maxLength={10}
            placeholderTextColor="#bbb"
          />

          <Text style={m.label}>Start tijd</Text>
          <TextInput
            style={m.input}
            value={form.startTime}
            onChangeText={(v) => set('startTime', formatTimeInput(v))}
            placeholder="HH:MM"
            keyboardType="numeric"
            maxLength={5}
            placeholderTextColor="#bbb"
          />

          <Text style={m.label}>Eind datum</Text>
          <TextInput
            style={m.input}
            value={form.endDate}
            onChangeText={(v) => set('endDate', formatDateInput(v))}
            placeholder="dd-mm-yyyy"
            keyboardType="numeric"
            maxLength={10}
            placeholderTextColor="#bbb"
          />

          <Text style={m.label}>Eind tijd</Text>
          <TextInput
            style={m.input}
            value={form.endTime}
            onChangeText={(v) => set('endTime', formatTimeInput(v))}
            placeholder="HH:MM"
            keyboardType="numeric"
            maxLength={5}
            placeholderTextColor="#bbb"
          />

          <Text style={m.label}>Locatie of link</Text>
          <TextInput
            style={m.input}
            value={form.locationOrLink}
            onChangeText={(v) => set('locationOrLink', v)}
            placeholder="Bijv. adres of videocall link"
            placeholderTextColor="#bbb"
            autoCapitalize="none"
          />

          <Text style={m.label}>Notities</Text>
          <TextInput
            style={[m.input, m.textArea]}
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            placeholder="Eventuele bijzonderheden..."
            multiline
            textAlignVertical="top"
            placeholderTextColor="#bbb"
          />

          <TouchableOpacity style={m.saveBtn} onPress={handleSubmit} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={m.saveBtnText}>{editing ? 'Wijzigingen opslaan' : 'Afspraak toevoegen'}</Text>
            }
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Hoofdscherm ──────────────────────────────────────────────────────────────

export default function AppointmentsScreen() {
  const router = useRouter();
  const { id: weddingId, title: weddingTitle } = useLocalSearchParams<{ id: string; title: string }>();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    if (!weddingId) { setLoading(false); return; }
    try {
      const result = await appointmentsApi.list(weddingId);
      const sorted = [...result].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      );
      setAppointments(sorted);
    } catch {
      // Stille fout — lijst blijft leeg
    } finally {
      setLoading(false);
    }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(data: NewAppointment, id?: string) {
    if (id) {
      const updated = await appointmentsApi.update(id, data);
      setAppointments((prev) => prev.map((a) => a.id === id ? updated : a));
    } else {
      const created = await appointmentsApi.create(weddingId!, data);
      setAppointments((prev) => {
        const all = [...prev, created];
        return all.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      });
    }
  }

  function handleEdit(appointment: Appointment) {
    setEditing(appointment);
    setModalVisible(true);
  }

  function handleDelete(appointment: Appointment) {
    Alert.alert(
      'Afspraak verwijderen',
      `Weet je zeker dat je "${appointment.title}" wilt verwijderen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Verwijderen',
          style: 'destructive',
          onPress: async () => {
            try {
              await appointmentsApi.cancel(appointment.id);
              setAppointments((prev) => prev.filter((a) => a.id !== appointment.id));
            } catch (e: any) {
              Alert.alert('Fout', e.message ?? 'Verwijderen mislukt.');
            }
          },
        },
      ]
    );
  }

  function openNew() {
    setEditing(null);
    setModalVisible(true);
  }

  // Groepeer afspraken per maand
  const grouped: { month: string; items: Appointment[] }[] = [];
  for (const appt of appointments) {
    const d = new Date(appt.startAt);
    const month = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
    const last = grouped[grouped.length - 1];
    if (!last || last.month !== month) {
      grouped.push({ month, items: [appt] });
    } else {
      last.items.push(appt);
    }
  }

  type ListItem =
    | { kind: 'header'; month: string; key: string }
    | { kind: 'appt'; item: Appointment; key: string };

  const listData: ListItem[] = [];
  for (const g of grouped) {
    listData.push({ kind: 'header', month: g.month, key: `h-${g.month}` });
    for (const item of g.items) {
      listData.push({ kind: 'appt', item, key: item.id });
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.kind === 'header') {
      return <Text style={s.monthHeader}>{item.month}</Text>;
    }
    const appt = item.item;
    const isPast = new Date(appt.startAt) < new Date();
    return (
      <View style={[s.card, isPast && s.cardPast]}>
        <View style={s.cardLeft}>
          <View style={[s.dateBadge, isPast && s.dateBadgePast]}>
            <Text style={[s.dateBadgeDay, isPast && s.dateBadgeDayPast]}>
              {new Date(appt.startAt).getDate()}
            </Text>
            <Text style={[s.dateBadgeMon, isPast && s.dateBadgeMonPast]}>
              {new Date(appt.startAt).toLocaleDateString('nl-NL', { month: 'short' })}
            </Text>
          </View>
        </View>
        <View style={s.cardBody}>
          <Text style={[s.cardTitle, isPast && s.cardTitlePast]} numberOfLines={1}>{appt.title}</Text>
          <View style={s.cardMeta}>
            <Clock size={12} color={isPast ? '#ccc' : '#aaa'} strokeWidth={2} />
            <Text style={[s.cardMetaText, isPast && s.cardMetaTextPast]}>
              {formatTime(appt.startAt)} – {formatTime(appt.endAt)}
            </Text>
          </View>
          {appt.locationOrLink ? (
            <View style={s.cardMeta}>
              <MapPin size={12} color={isPast ? '#ccc' : '#aaa'} strokeWidth={2} />
              <Text style={[s.cardMetaText, isPast && s.cardMetaTextPast]} numberOfLines={1}>
                {appt.locationOrLink}
              </Text>
            </View>
          ) : null}
          {appt.notes ? (
            <View style={s.cardMeta}>
              <StickyNote size={12} color={isPast ? '#ccc' : '#aaa'} strokeWidth={2} />
              <Text style={[s.cardMetaText, isPast && s.cardMetaTextPast]} numberOfLines={2}>
                {appt.notes}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity onPress={() => handleEdit(appt)} style={s.actionBtn}>
            <Pencil size={16} color="#8B6E6E" strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(appt)} style={s.actionBtn}>
            <Trash2 size={16} color="#c0392b" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle} numberOfLines={1}>{weddingTitle ?? 'Afspraken'}</Text>
          <Text style={s.headerSub}>Afsprakenoverzicht</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openNew}>
          <Plus size={20} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#8B6E6E" />
          <Text style={s.loadingText}>Afspraken laden...</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <CalendarDays size={48} color="#ddd" strokeWidth={1} />
              <Text style={s.emptyTitle}>Nog geen afspraken</Text>
              <Text style={s.emptySub}>
                Voeg een afspraak toe via de + knop. Afspraken zijn zichtbaar voor alle leveranciers van deze bruiloft.
              </Text>
              <TouchableOpacity style={s.emptyAddBtn} onPress={openNew}>
                <Plus size={16} color="#fff" strokeWidth={2.5} />
                <Text style={s.emptyAddBtnText}>Eerste afspraak toevoegen</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <AppointmentModal
        visible={modalVisible}
        editing={editing}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
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
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#aaa', fontSize: 14 },

  list: { padding: 16, paddingBottom: 32, flexGrow: 1 },

  monthHeader: {
    fontSize: 13, fontWeight: '700', color: '#8B6E6E',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 16, marginBottom: 8, paddingLeft: 2,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  cardPast: { opacity: 0.55 },

  cardLeft: { alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  dateBadge: {
    width: 44, alignItems: 'center',
    backgroundColor: '#fdf5f5', borderRadius: 10, paddingVertical: 6,
  },
  dateBadgePast: { backgroundColor: '#f5f5f5' },
  dateBadgeDay: { fontSize: 20, fontWeight: '700', color: '#8B6E6E', lineHeight: 24 },
  dateBadgeDayPast: { color: '#bbb' },
  dateBadgeMon: { fontSize: 11, color: '#8B6E6E', fontWeight: '600', textTransform: 'uppercase' },
  dateBadgeMonPast: { color: '#bbb' },

  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  cardTitlePast: { color: '#aaa' },
  cardMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  cardMetaText: { fontSize: 13, color: '#888', flex: 1, lineHeight: 18 },
  cardMetaTextPast: { color: '#ccc' },

  cardActions: { justifyContent: 'flex-start', gap: 8, paddingTop: 2 },
  actionBtn: { padding: 4 },

  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#aaa' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#8B6E6E', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  emptyAddBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

const m = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#f0eded',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  closeBtn: { padding: 4 },
  body: { flex: 1 },
  bodyContent: { padding: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    padding: 12, fontSize: 15, backgroundColor: '#fafafa',
    marginBottom: 14, color: '#333',
  },
  textArea: { minHeight: 100 },
  saveBtn: {
    backgroundColor: '#8B6E6E', borderRadius: 10,
    padding: 15, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
