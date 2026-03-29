import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Check, X, Heart } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { invitationsApi, Invitation } from '../../src/api/invitations';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
}

export default function InvitationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!user) { setLoading(false); return; }
    if (isRefresh) setRefreshing(true);
    try {
      const list = await invitationsApi.mine();
      setInvitations(list.filter(i => i.status === 'pending'));
    } catch { /* silent */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleAccept(inv: Invitation) {
    if (!user) return;
    setActingOn(inv.id);
    try {
      await invitationsApi.accept(inv.id, user.id);
      setInvitations(prev => prev.filter(i => i.id !== inv.id));
      Alert.alert('Geaccepteerd!', `Je hebt de uitnodiging voor "${inv.wedding_title ?? 'deze bruiloft'}" geaccepteerd. De bruiloft staat nu in je dashboard.`);
    } catch (e: any) {
      Alert.alert('Fout', e.message ?? 'Accepteren mislukt.');
    } finally {
      setActingOn(null);
    }
  }

  async function handleDecline(inv: Invitation) {
    Alert.alert(
      'Uitnodiging afwijzen',
      `Weet je zeker dat je de uitnodiging voor "${inv.wedding_title ?? 'deze bruiloft'}" wilt afwijzen?`,
      [
        { text: 'Annuleren', style: 'cancel' },
        {
          text: 'Afwijzen',
          style: 'destructive',
          onPress: async () => {
            setActingOn(inv.id);
            try {
              await invitationsApi.decline(inv.id, 'Afgewezen door gebruiker');
              setInvitations(prev => prev.filter(i => i.id !== inv.id));
            } catch (e: any) {
              Alert.alert('Fout', e.message ?? 'Afwijzen mislukt.');
            } finally {
              setActingOn(null);
            }
          },
        },
      ]
    );
  }

  const renderItem = ({ item }: { item: Invitation }) => {
    const isLoading = actingOn === item.id;
    return (
      <View style={s.card}>
        <View style={s.cardIcon}>
          <Heart size={22} color="#8B6E6E" strokeWidth={1.5} />
        </View>
        <View style={s.cardBody}>
          <Text style={s.cardTitle} numberOfLines={1}>
            {item.wedding_title ?? 'Bruiloft uitnodiging'}
          </Text>
          <Text style={s.cardType}>
            {item.type === 'couple_invite' ? 'Uitgenodigd als bruidspaar' : 'Uitgenodigd als leverancier'}
          </Text>
          <Text style={s.cardDate}>Ontvangen op {formatDate(item.created_at)}</Text>
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity
            style={[s.acceptBtn, isLoading && s.btnLoading]}
            onPress={() => handleAccept(item)}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Check size={18} color="#fff" strokeWidth={2.5} />
            }
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.declineBtn, isLoading && s.btnLoading]}
            onPress={() => handleDecline(item)}
            disabled={isLoading}
          >
            <X size={18} color="#c0392b" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Bell size={20} color="#fff" strokeWidth={2} />
        <Text style={s.headerTitle}>Uitnodigingen</Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#8B6E6E" />
          <Text style={s.loadingText}>Uitnodigingen laden...</Text>
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#8B6E6E" />}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Bell size={48} color="#ddd" strokeWidth={1} />
              <Text style={s.emptyTitle}>Geen openstaande uitnodigingen</Text>
              <Text style={s.emptySub}>Wanneer iemand je uitnodigt voor een bruiloft, zie je dat hier.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: {
    backgroundColor: '#8B6E6E',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 14, paddingHorizontal: 20,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#aaa', fontSize: 14 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fdf5f5', justifyContent: 'center', alignItems: 'center',
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  cardType: { fontSize: 12, color: '#8B6E6E', marginTop: 2, fontWeight: '500' },
  cardDate: { fontSize: 12, color: '#aaa', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#27ae60', justifyContent: 'center', alignItems: 'center',
  },
  declineBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#fde8e8', justifyContent: 'center', alignItems: 'center',
  },
  btnLoading: { opacity: 0.5 },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#aaa' },
  emptySub: { fontSize: 13, color: '#ccc', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
});
