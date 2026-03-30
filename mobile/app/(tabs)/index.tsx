import { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Heart, ChevronRight, Plus, MapPin, CalendarDays, Bell } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { weddingsApi, Wedding } from '../../src/api/weddings';
import { invitationsApi } from '../../src/api/invitations';

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function dateToIso(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length < 8) return display;
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [weddings, setWeddings] = useState<Wedding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [name1, setName1] = useState('');
  const [name2, setName2] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pendingInviteCount, setPendingInviteCount] = useState(0);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      const data = await weddingsApi.list();
      setWeddings(data);
      invitationsApi.mine().then(list => setPendingInviteCount(list.length)).catch(() => {});
    } catch (e: any) {
      // Auth errors are handled globally by AuthContext (redirect to login).
      if (!e?.message?.includes('Sessie verlopen')) {
        Alert.alert('Fout', e.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openModal() {
    setName1('');
    setName2('');
    setWeddingDate('');
    setLocation('');
    setError('');
    setModalVisible(true);
  }

  async function handleAdd() {
    if (!name1.trim()) { setError('Vul minimaal de eerste naam in.'); return; }
    if (!weddingDate.trim() || weddingDate.length < 10) { setError('Vul een geldige datum in (bijv. 15-09-2026).'); return; }
    setError('');
    setSaving(true);
    const title = [name1.trim(), name2.trim()].filter(Boolean).join(' & ');
    try {
      const created = await weddingsApi.create({
        title,
        wedding_date: dateToIso(weddingDate),
        location: location.trim() || undefined,
      });
      setWeddings((prev) => [created, ...prev]);
      setModalVisible(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#8B6E6E" />;

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      <FlatList
        data={weddings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#8B6E6E" />
        }
        ListHeaderComponent={
          <>
            {pendingInviteCount > 0 && (
              <TouchableOpacity
                style={styles.inviteBanner}
                onPress={() => router.push('/(tabs)/invitations')}
                activeOpacity={0.8}
              >
                <Bell size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.inviteBannerText}>
                  Je hebt {pendingInviteCount} openstaande uitnodiging{pendingInviteCount > 1 ? 'en' : ''}
                </Text>
                <ChevronRight size={16} color="rgba(255,255,255,0.8)" strokeWidth={2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.addButton} onPress={openModal}>
              <Plus size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.addButtonText}>Nieuwe bruiloft toevoegen</Text>
            </TouchableOpacity>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Heart size={48} color="#ddd" strokeWidth={1.25} />
            <Text style={styles.emptyText}>Nog geen bruiloften</Text>
            <Text style={styles.emptyHint}>Voeg je eerste bruiloft toe via de knop hierboven</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/wedding/[id]', params: { id: item.id, data: JSON.stringify(item) } })}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardName}>{item.title}</Text>
              <ChevronRight size={18} color="#ccc" strokeWidth={2} />
            </View>
            <View style={styles.cardMeta}>
              <CalendarDays size={13} color="#8B6E6E" strokeWidth={1.75} />
              <Text style={styles.cardDate}>
                {item.wedding_date
                  ? new Date(item.wedding_date + 'T00:00:00').toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : 'Datum onbekend'}
              </Text>
            </View>
            {item.location ? (
              <View style={styles.cardMeta}>
                <MapPin size={13} color="#bbb" strokeWidth={1.75} />
                <Text style={styles.cardVenue}>{item.location}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      />

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Nieuwe bruiloft</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalClose}>Annuleren</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Naam persoon 1 *</Text>
          <TextInput
            style={styles.input}
            placeholder="bijv. Emma"
            value={name1}
            onChangeText={setName1}
          />

          <Text style={styles.fieldLabel}>Naam persoon 2</Text>
          <TextInput
            style={styles.input}
            placeholder="bijv. Liam"
            value={name2}
            onChangeText={setName2}
          />

          <Text style={styles.fieldLabel}>Trouwdatum *</Text>
          <TextInput
            style={styles.input}
            placeholder="dd-mm-yyyy"
            value={weddingDate}
            onChangeText={(v) => setWeddingDate(formatDateInput(v))}
            keyboardType="numeric"
            maxLength={10}
          />
          <Text style={styles.fieldHint}>Formaat: dag-maand-jaar (bijv. 15-09-2026)</Text>

          <Text style={styles.fieldLabel}>Locatie</Text>
          <TextInput
            style={styles.input}
            placeholder="bijv. Kasteel De Hooge Vuursche, Amsterdam"
            value={location}
            onChangeText={setLocation}
          />

          {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <TouchableOpacity style={styles.saveButton} onPress={handleAdd} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Bruiloft opslaan</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  addButton: { backgroundColor: '#8B6E6E', borderRadius: 10, padding: 15, alignItems: 'center', marginBottom: 4, flexDirection: 'row', gap: 8 },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardName: { fontSize: 17, fontWeight: '600', color: '#333', flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardDate: { fontSize: 13, color: '#8B6E6E' },
  cardVenue: { fontSize: 13, color: '#999' },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 17, color: '#aaa', fontWeight: '500' },
  emptyHint: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingHorizontal: 32 },
  modal: { flex: 1, padding: 24, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  modalClose: { color: '#8B6E6E', fontSize: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  fieldHint: { fontSize: 12, color: '#bbb', marginTop: -8, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 16, backgroundColor: '#fafafa' },
  saveButton: { backgroundColor: '#8B6E6E', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 4 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorBox: { backgroundColor: '#fdecea', borderRadius: 8, padding: 12, marginBottom: 12 },
  errorText: { color: '#c0392b', fontSize: 14 },
  inviteBanner: {
    backgroundColor: '#8B6E6E',
    borderRadius: 12, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  inviteBannerText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
});
