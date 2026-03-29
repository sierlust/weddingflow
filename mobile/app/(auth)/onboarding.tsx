import { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, TextInput,
  Platform, Animated, KeyboardAvoidingView,
} from 'react-native';
import {
  Camera, Video, Flower2, Scissors, Music2, MapPin, Shirt,
  BookOpen, Briefcase, Car, Package, Sparkles, Moon, Zap,
  ClipboardList, UtensilsCrossed, Mic, Heart, ChevronLeft,
} from 'lucide-react-native';
import { supplierApi } from '../../src/api/supplier';
import { weddingsApi } from '../../src/api/weddings';
import { useAuth } from '../../src/context/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type RoleType = 'couple' | 'supplier' | null;

type SupplierCategory = {
  label: string;
  Icon: React.ComponentType<any>;
  description: string;
};

// ─── 16 Leverancierscategorieën ──────────────────────────────────────────────

const SUPPLIER_CATEGORIES: SupplierCategory[] = [
  { label: 'Trouwlocatie',    Icon: MapPin,           description: 'Zaal, kasteel of buitenlocatie' },
  { label: 'Trouwjurk',       Icon: Shirt,            description: 'Bruidsmode & pasafspraken' },
  { label: 'Trouwpak',        Icon: Briefcase,        description: 'Herenpak & accessoires' },
  { label: 'Trouwfotograaf',  Icon: Camera,           description: 'Reportage & bruidsfotografie' },
  { label: 'Videograaf',      Icon: Video,            description: 'Film, highlights & documentaires' },
  { label: 'Bloemist',        Icon: Flower2,          description: 'Boeket, decoratie & styling' },
  { label: 'Muziek',          Icon: Music2,           description: 'Live band, DJ & ceremoniemuziek' },
  { label: 'Trouwauto',       Icon: Car,              description: 'Vervoer van het bruidspaar' },
  { label: 'Weddingplanner',  Icon: ClipboardList,    description: 'Coördinatie van de grote dag' },
  { label: 'Ceremoniemeester',Icon: Mic,              description: 'Persoonlijke & plechtige ceremonie' },
  { label: 'Catering',        Icon: UtensilsCrossed,  description: 'Diner, buffet & drankpakketten' },
  { label: 'Bruidskapsel',    Icon: Scissors,         description: 'Haarstyling & opsteekwerk' },
  { label: 'Bruids make-up',  Icon: Sparkles,         description: 'Make-up & beauty op de trouwdag' },
  { label: 'Huwelijksnacht',  Icon: Moon,             description: 'Bruidssuite & overnachting' },
  { label: 'Entertainment',   Icon: Zap,              description: 'Fotocabine, goochelaar & meer' },
  { label: 'Verhuur',         Icon: Package,          description: 'Meubilair, decoratie & materiaal' },
];

// ─── Datum/input hulpfuncties ─────────────────────────────────────────────────

function formatDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function toIso(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.length < 8) return '';
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

// ─── Stap 1: Wie ben jij? ─────────────────────────────────────────────────────

function StepRole({ onSelect }: { onSelect: (role: RoleType) => void }) {
  return (
    <View style={s.stepWrap}>
      <View style={s.header}>
        <Text style={s.stepTitle}>Welkom bij WeddingFlow</Text>
        <Text style={s.stepSubtitle}>Vertel ons wie je bent, zodat we jouw ervaring kunnen aanpassen.</Text>
      </View>

      <TouchableOpacity style={s.roleCard} onPress={() => onSelect('couple')} activeOpacity={0.8}>
        <View style={[s.roleIconWrap, { backgroundColor: '#fdf5f5' }]}>
          <Heart size={30} color="#8B6E6E" strokeWidth={1.5} fill="#e8c8c8" />
        </View>
        <View style={s.roleBody}>
          <Text style={s.roleLabel}>Wij gaan trouwen</Text>
          <Text style={s.roleDesc}>Bruidspaar dat een bruiloft wil plannen en leveranciers wil uitnodigen</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={s.roleCard} onPress={() => onSelect('supplier')} activeOpacity={0.8}>
        <View style={[s.roleIconWrap, { backgroundColor: '#f5f8fd' }]}>
          <Briefcase size={30} color="#5b7fbf" strokeWidth={1.5} />
        </View>
        <View style={s.roleBody}>
          <Text style={s.roleLabel}>Ik ben een trouwleverancier</Text>
          <Text style={s.roleDesc}>Fotograaf, florist, catering en andere professionals</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

// ─── Stap 2A: Bruiloft aanmaken (bruidspaar) ─────────────────────────────────

function StepCouple({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: () => void;
}) {
  const [names, setNames]       = useState('');
  const [dateDisplay, setDate]  = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving]     = useState(false);

  async function handleCreate() {
    if (!names.trim()) {
      Alert.alert('Vereist', 'Vul jullie namen in (bijv. Emma & Liam).');
      return;
    }
    setSaving(true);
    try {
      // Save couple category to profile
      await supplierApi.updateProfile({ category: 'Bruidspaar' });

      // Create the wedding
      const isoDate = toIso(dateDisplay);
      await weddingsApi.create({
        title: names.trim(),
        wedding_date: isoDate || '2027-01-01',
        location: location.trim() || undefined,
      });

      onDone();
    } catch (e: any) {
      Alert.alert('Fout', e?.message ?? 'Opslaan mislukt. Probeer het opnieuw.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.stepWrap}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <ChevronLeft size={18} color="#8B6E6E" strokeWidth={2} />
          <Text style={s.backText}>Terug</Text>
        </TouchableOpacity>

        <View style={s.header}>
          <View style={s.headerIcon}>
            <Heart size={28} color="#8B6E6E" strokeWidth={1.5} fill="#e8c8c8" />
          </View>
          <Text style={s.stepTitle}>Jullie bruiloft</Text>
          <Text style={s.stepSubtitle}>
            Vul de basisgegevens in. Je kunt alles later nog aanpassen.
          </Text>
        </View>

        <View style={s.formCard}>
          <Text style={s.label}>Namen bruidspaar *</Text>
          <TextInput
            style={s.input}
            value={names}
            onChangeText={setNames}
            placeholder="bijv. Emma & Liam"
            placeholderTextColor="#bbb"
            returnKeyType="next"
          />

          <Text style={s.label}>Trouwdatum</Text>
          <TextInput
            style={s.input}
            value={dateDisplay}
            onChangeText={(v) => setDate(formatDateInput(v))}
            placeholder="dd-mm-yyyy"
            keyboardType="numeric"
            maxLength={10}
            placeholderTextColor="#bbb"
            returnKeyType="next"
          />

          <Text style={s.label}>Trouwlocatie</Text>
          <TextInput
            style={[s.input, { marginBottom: 0 }]}
            value={location}
            onChangeText={setLocation}
            placeholder="bijv. Kasteel De Hooge Vuursche"
            placeholderTextColor="#bbb"
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
        </View>
      </View>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btn, !names.trim() && s.btnDisabled]}
          onPress={handleCreate}
          disabled={!names.trim() || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Bruiloft aanmaken en beginnen</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Stap 2B: Leverancier type kiezen ────────────────────────────────────────

function StepSupplier({
  onBack,
  onDone,
}: {
  onBack: () => void;
  onDone: (category: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    try {
      await supplierApi.updateProfile({ category: selected });
      onDone(selected);
    } catch (e: any) {
      Alert.alert('Fout', e?.message ?? 'Opslaan mislukt. Probeer het opnieuw.');
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={s.supplierScroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <ChevronLeft size={18} color="#8B6E6E" strokeWidth={2} />
          <Text style={s.backText}>Terug</Text>
        </TouchableOpacity>

        <View style={s.header}>
          <Text style={s.stepTitle}>Welk type leverancier ben je?</Text>
          <Text style={s.stepSubtitle}>
            Je dashboard past zich aan op jouw vak.{'\n'}Je kunt dit later niet meer zelf wijzigen.
          </Text>
        </View>

        <View style={s.grid}>
          {SUPPLIER_CATEGORIES.map((cat) => {
            const active = selected === cat.label;
            return (
              <TouchableOpacity
                key={cat.label}
                style={[s.tile, active && s.tileActive]}
                onPress={() => setSelected(cat.label)}
                activeOpacity={0.75}
              >
                <View style={[s.iconWrap, active && s.iconWrapActive]}>
                  <cat.Icon size={24} color={active ? '#fff' : '#8B6E6E'} strokeWidth={1.75} />
                </View>
                <Text style={[s.tileLabel, active && s.tileLabelActive]}>{cat.label}</Text>
                <Text style={[s.tileDesc, active && s.tileDescActive]} numberOfLines={2}>
                  {cat.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.btn, !selected && s.btnDisabled]}
          onPress={handleConfirm}
          disabled={!selected || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>
                {selected ? `Doorgaan als ${selected}` : 'Kies een leverancierstype'}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Hoofd onboarding screen ──────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { updateProfileCategory } = useAuth();
  const [role, setRole] = useState<RoleType>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  function navigateTo(newRole: RoleType) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setRole(newRole);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  function handleDone(category: string) {
    updateProfileCategory(category);
    // Root layout auto-redirects to /(tabs)
  }

  return (
    <Animated.View style={[s.root, { opacity: fadeAnim }]}>
      {role === null && (
        <ScrollView contentContainerStyle={s.roleScroll} showsVerticalScrollIndicator={false}>
          <StepRole onSelect={(r) => navigateTo(r)} />
        </ScrollView>
      )}

      {role === 'couple' && (
        <StepCouple
          onBack={() => navigateTo(null)}
          onDone={() => handleDone('Bruidspaar')}
        />
      )}

      {role === 'supplier' && (
        <StepSupplier
          onBack={() => navigateTo(null)}
          onDone={(category) => handleDone(category)}
        />
      )}
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f8f8' },

  roleScroll: { padding: 24, paddingTop: 60, flexGrow: 1 },
  supplierScroll: { padding: 24, paddingTop: 16, paddingBottom: 8 },

  stepWrap: { flex: 1, padding: 24, paddingTop: 20 },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 20, alignSelf: 'flex-start',
  },
  backText: { color: '#8B6E6E', fontSize: 15, fontWeight: '500' },

  header: { alignItems: 'center', marginBottom: 28 },
  headerIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#fdf5f5', justifyContent: 'center', alignItems: 'center',
    marginBottom: 14,
  },
  stepTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  stepSubtitle: {
    fontSize: 15, color: '#999', textAlign: 'center',
    marginTop: 8, lineHeight: 22,
  },

  // Role cards
  roleCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
    borderWidth: 2, borderColor: 'transparent',
  },
  roleIconWrap: {
    width: 58, height: 58, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  roleBody: { flex: 1 },
  roleLabel: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 4 },
  roleDesc: { fontSize: 13, color: '#aaa', lineHeight: 18 },

  // Couple form
  formCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
  },
  label: {
    fontSize: 12, fontWeight: '600', color: '#888',
    marginBottom: 6, textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12,
    fontSize: 15, backgroundColor: '#fafafa', marginBottom: 16, color: '#333',
  },

  // Supplier grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    justifyContent: 'space-between',
  },
  tile: {
    width: '47.5%', backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 2, borderColor: '#f0eded',
    shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  tileActive: { borderColor: '#8B6E6E', backgroundColor: '#fdf8f7' },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#fdf4f2', justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  iconWrapActive: { backgroundColor: '#8B6E6E' },
  tileLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 3 },
  tileLabelActive: { color: '#8B6E6E' },
  tileDesc: { fontSize: 11, color: '#aaa', lineHeight: 15 },
  tileDescActive: { color: '#9e8080' },

  // Footer
  footer: {
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    backgroundColor: '#f8f8f8',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  btn: {
    backgroundColor: '#8B6E6E', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#d9cece' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
