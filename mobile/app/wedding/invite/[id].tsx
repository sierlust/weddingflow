import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, Users2, Mail, Check, X, Clock, UserPlus } from 'lucide-react-native';
import { useAuth } from '../../../src/context/AuthContext';
import { invitationsApi, Invitation, InviteType } from '../../../src/api/invitations';

const TYPE_OPTIONS: { label: string; value: InviteType; description: string }[] = [
  { label: 'Leverancier', value: 'supplier_invite', description: 'Fotograaf, DJ, catering...' },
  { label: 'Bruidspaar', value: 'couple_invite', description: 'De bruid en bruidegom' },
];

const STATUS_COLOR: Record<string, string> = {
  pending: '#f39c12',
  accepted: '#27ae60',
  declined: '#e74c3c',
  expired: '#95a5a6',
  revoked: '#95a5a6',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'In afwachting',
  accepted: 'Geaccepteerd',
  declined: 'Afgewezen',
  expired: 'Verlopen',
  revoked: 'Ingetrokken',
};

export default function InviteScreen() {
  const router = useRouter();
  const { id: weddingId, title: weddingTitle } = useLocalSearchParams<{ id: string; title: string }>();
  const { user } = useAuth();

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteType, setInviteType] = useState<InviteType>('supplier_invite');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!weddingId) { setLoading(false); return; }
    try {
      const list = await invitationsApi.listForWedding(weddingId);
      setInvitations(list);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [weddingId]);

  useEffect(() => { load(); }, [load]);

  async function handleSendInvite() {
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      Alert.alert('Ongeldig', 'Voer een geldig e-mailadres in.');
      return;
    }
    setSending(true);
    try {
      await invitationsApi.invite(weddingId!, emailTrimmed, inviteType);
      setEmail('');
      setModalVisible(false);
      load();
      Alert.alert('Uitnodiging verstuurd', `Een uitnodiging is verstuurd naar ${emailTrimmed}.`);
    } catch (e: any) {
      Alert.alert('Fout', e.message ?? 'Uitnodiging verzenden mislukt.');
    } finally {
      setSending(false);
    }
  }

  const pending = invitations.filter(i => i.status === 'pending');
  const others = invitations.filter(i => i.status !== 'pending');

  return (
    <View style={{ flex: 1, backgroundColor: '#f8f8f8' }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ArrowLeft size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle} numberOfLines={1}>{weddingTitle ?? 'Team'}</Text>
          <Text style={s.headerSub}>Team & uitnodigingen</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => setModalVisible(true)}>
          <UserPlus size={19} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#8B6E6E" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>

          {/* Pending invitations */}
          {pending.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>In afwachting ({pending.length})</Text>
              {pending.map(inv => (
                <View key={inv.id} style={s.invCard}>
                  <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[inv.status] }]} />
                  <View style={s.invBody}>
                    <Text style={s.invEmail}>{inv.target_email}</Text>
                    <Text style={s.invMeta}>
                      {inv.type === 'couple_invite' ? 'Bruidspaar' : 'Leverancier'} · {STATUS_LABEL[inv.status]}
                    </Text>
                  </View>
                  <Clock size={16} color="#f39c12" strokeWidth={2} />
                </View>
              ))}
            </View>
          )}

          {/* Accepted members */}
          {others.filter(i => i.status === 'accepted').length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Team</Text>
              {others.filter(i => i.status === 'accepted').map(inv => (
                <View key={inv.id} style={s.invCard}>
                  <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[inv.status] }]} />
                  <View style={s.invBody}>
                    <Text style={s.invEmail}>{inv.target_email}</Text>
                    <Text style={s.invMeta}>
                      {inv.type === 'couple_invite' ? 'Bruidspaar' : 'Leverancier'} · Lid van dit team
                    </Text>
                  </View>
                  <Check size={16} color="#27ae60" strokeWidth={2.5} />
                </View>
              ))}
            </View>
          )}

          {/* Declined / expired */}
          {others.filter(i => ['declined','expired','revoked'].includes(i.status)).length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Overig</Text>
              {others.filter(i => ['declined','expired','revoked'].includes(i.status)).map(inv => (
                <View key={inv.id} style={[s.invCard, { opacity: 0.5 }]}>
                  <View style={[s.statusDot, { backgroundColor: STATUS_COLOR[inv.status] }]} />
                  <View style={s.invBody}>
                    <Text style={s.invEmail}>{inv.target_email}</Text>
                    <Text style={s.invMeta}>{STATUS_LABEL[inv.status]}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {invitations.length === 0 && (
            <View style={s.emptyWrap}>
              <Users2 size={48} color="#ddd" strokeWidth={1} />
              <Text style={s.emptyTitle}>Nog geen teamleden</Text>
              <Text style={s.emptySub}>Nodig leveranciers of het bruidspaar uit via de + knop.</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => setModalVisible(true)}>
                <UserPlus size={16} color="#fff" strokeWidth={2} />
                <Text style={s.emptyBtnText}>Eerste uitnodiging versturen</Text>
              </TouchableOpacity>
            </View>
          )}

        </ScrollView>
      )}

      {/* Invite Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={m.header}>
            <Text style={m.title}>Uitnodiging versturen</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={m.closeBtn}>
              <X size={22} color="#666" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <ScrollView style={m.body} contentContainerStyle={m.bodyContent} keyboardShouldPersistTaps="handled">

            <Text style={m.label}>E-mailadres</Text>
            <TextInput
              style={m.input}
              value={email}
              onChangeText={setEmail}
              placeholder="naam@email.nl"
              placeholderTextColor="#bbb"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={m.label}>Rol</Text>
            {TYPE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[m.typeCard, inviteType === opt.value && m.typeCardSelected]}
                onPress={() => setInviteType(opt.value)}
              >
                <View style={m.typeCardInner}>
                  <Text style={[m.typeLabel, inviteType === opt.value && m.typeLabelSelected]}>{opt.label}</Text>
                  <Text style={m.typeDesc}>{opt.description}</Text>
                </View>
                {inviteType === opt.value && <Check size={18} color="#8B6E6E" strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}

            <Text style={m.hint}>
              {inviteType === 'couple_invite'
                ? 'Het bruidspaar ontvangt een e-mail om een account aan te maken en de bruiloft te bekijken.'
                : 'De leverancier ontvangt een e-mail om deel te nemen aan deze bruiloft. Als ze nog geen account hebben, kunnen ze er een aanmaken via de link in de e-mail.'
              }
            </Text>

            <TouchableOpacity style={m.sendBtn} onPress={handleSendInvite} disabled={sending}>
              {sending
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Mail size={16} color="#fff" strokeWidth={2} />
                    <Text style={m.sendBtnText}>Uitnodiging versturen</Text>
                  </>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: '#8B6E6E',
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14, paddingHorizontal: 16, gap: 12,
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: '#8B6E6E',
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
  },
  invCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  invBody: { flex: 1 },
  invEmail: { fontSize: 14, fontWeight: '600', color: '#333' },
  invMeta: { fontSize: 12, color: '#aaa', marginTop: 2 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#aaa' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#8B6E6E', borderRadius: 10,
    paddingHorizontal: 20, paddingVertical: 12, marginTop: 8,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

const m = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f0eded',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#333' },
  closeBtn: { padding: 4 },
  body: { flex: 1 },
  bodyContent: { padding: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    padding: 12, fontSize: 15, backgroundColor: '#fafafa',
    marginBottom: 16, color: '#333',
  },
  typeCard: {
    borderWidth: 1.5, borderColor: '#eee', borderRadius: 10, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  typeCardSelected: { borderColor: '#8B6E6E', backgroundColor: '#fdf5f5' },
  typeCardInner: { flex: 1 },
  typeLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  typeLabelSelected: { color: '#8B6E6E' },
  typeDesc: { fontSize: 12, color: '#aaa', marginTop: 2 },
  hint: { fontSize: 13, color: '#aaa', lineHeight: 19, marginVertical: 12, backgroundColor: '#f8f8f8', borderRadius: 8, padding: 12 },
  sendBtn: {
    backgroundColor: '#8B6E6E', borderRadius: 10, padding: 15,
    alignItems: 'center', marginTop: 8, flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
