import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { Lock } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import { supplierApi, SupplierProfile } from '../../src/api/supplier';

const ADMIN_EMAIL = 'admin@weddingflow.com';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<SupplierProfile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supplierApi.getProfile()
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      // Stuur nooit de category mee — die kan alleen de admin wijzigen
      const { category: _cat, ...rest } = profile;
      const updated = await supplierApi.updateProfile(rest);
      setProfile((prev) => ({ ...updated, category: prev.category }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      // Toon fout inline in plaats van een popup
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  function openAdminMail() {
    Linking.openURL(
      `mailto:${ADMIN_EMAIL}?subject=Leverancierstype wijzigen&body=Hallo,%0A%0AIk wil graag mijn leverancierstype wijzigen van ${profile.category ?? '...'} naar ...%0A%0AMet vriendelijke groet,%0A${user?.name ?? ''}`
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#8B6E6E" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8f8f8' }} contentContainerStyle={styles.container}>

      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user?.name?.charAt(0).toUpperCase() ?? '?'}</Text>
      </View>
      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <Text style={styles.sectionTitle}>Bedrijfsprofiel</Text>

      {/* Leverancierstype — alleen-lezen */}
      <Text style={styles.label}>Soort leverancier</Text>
      <View style={styles.lockedRow}>
        <View style={styles.lockedBadge}>
          <Text style={styles.lockedBadgeText}>{profile.category ?? '—'}</Text>
        </View>
        <TouchableOpacity style={styles.lockedHint} onPress={openAdminMail} activeOpacity={0.7}>
          <Lock size={13} color="#aaa" strokeWidth={2} />
          <Text style={styles.lockedHintText}>Wijzigen via admin</Text>
        </TouchableOpacity>
      </View>

      {/* Overige bewerkbare velden */}
      <Text style={styles.label}>Bedrijfsnaam</Text>
      <TextInput
        style={styles.input}
        value={profile.name ?? ''}
        onChangeText={(v) => setProfile((p) => ({ ...p, name: v }))}
        placeholder="Naam van je bedrijf"
        placeholderTextColor="#bbb"
      />

      <Text style={styles.label}>Locatie</Text>
      <TextInput
        style={styles.input}
        value={profile.location ?? ''}
        onChangeText={(v) => setProfile((p) => ({ ...p, location: v }))}
        placeholder="Bijv. Amsterdam"
        placeholderTextColor="#bbb"
      />

      <Text style={styles.label}>Omschrijving</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={profile.description ?? ''}
        onChangeText={(v) => setProfile((p) => ({ ...p, description: v }))}
        placeholder="Korte beschrijving van je diensten"
        placeholderTextColor="#bbb"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Website</Text>
      <TextInput
        style={styles.input}
        value={profile.website ?? ''}
        onChangeText={(v) => setProfile((p) => ({ ...p, website: v }))}
        placeholder="https://jouwsite.nl"
        placeholderTextColor="#bbb"
        keyboardType="url"
        autoCapitalize="none"
      />

      <Text style={styles.label}>Instagram</Text>
      <TextInput
        style={styles.input}
        value={profile.instagram ?? ''}
        onChangeText={(v) => setProfile((p) => ({ ...p, instagram: v }))}
        placeholder="@jouwaccount"
        placeholderTextColor="#bbb"
        autoCapitalize="none"
      />

      <TouchableOpacity
        style={[styles.saveButton, saved && styles.saveButtonSuccess]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveButtonText}>{saved ? '✓ Opgeslagen' : 'Profiel opslaan'}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Uitloggen</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#8B6E6E', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 10 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  name: { fontSize: 20, fontWeight: '700', color: '#333', textAlign: 'center' },
  email: { fontSize: 14, color: '#999', textAlign: 'center', marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 16 },
  label: { fontSize: 13, color: '#666', marginBottom: 6, fontWeight: '500' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fff', marginBottom: 16, color: '#333' },
  textArea: { minHeight: 90 },

  lockedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  lockedBadge: { backgroundColor: '#f0eded', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  lockedBadgeText: { fontSize: 14, fontWeight: '700', color: '#8B6E6E' },
  lockedHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockedHintText: { fontSize: 12, color: '#aaa', textDecorationLine: 'underline' },

  saveButton: { backgroundColor: '#8B6E6E', borderRadius: 8, padding: 15, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  saveButtonSuccess: { backgroundColor: '#5a8a5a' },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  logoutButton: { borderWidth: 1.5, borderColor: '#ddd', borderRadius: 8, padding: 14, alignItems: 'center' },
  logoutText: { color: '#999', fontWeight: '500', fontSize: 15 },
});
