import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, TextInput as RNTextInput,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  const emailRef    = useRef<RNTextInput>(null);
  const passwordRef = useRef<RNTextInput>(null);
  const confirmRef  = useRef<RNTextInput>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirm('');
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Vul je e-mail en wachtwoord in.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      const msg = e?.message ?? 'Onbekende fout';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!name.trim()) {
      setError('Vul je naam in.');
      return;
    }
    if (!email.trim()) {
      setError('Vul je e-mailadres in.');
      return;
    }
    if (password.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens zijn.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      const msg = e?.message ?? 'Onbekende fout';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === 'login';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo / header */}
        <View style={styles.header}>
          <Text style={styles.title}>WeddingFlow</Text>
          <Text style={styles.subtitle}>Leveranciersportaal</Text>
        </View>

        {/* Mode tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, isLogin && styles.tabActive]}
            onPress={() => switchMode('login')}
          >
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Inloggen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, !isLogin && styles.tabActive]}
            onPress={() => switchMode('register')}
          >
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Account aanmaken</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {!isLogin && (
            <TextInput
              style={styles.input}
              placeholder="Volledige naam"
              placeholderTextColor="#bbb"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!loading}
            />
          )}

          <TextInput
            ref={emailRef}
            style={styles.input}
            placeholder="E-mailadres"
            placeholderTextColor="#bbb"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            editable={!loading}
          />

          <TextInput
            ref={passwordRef}
            style={styles.input}
            placeholder="Wachtwoord"
            placeholderTextColor="#bbb"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType={isLogin ? 'done' : 'next'}
            onSubmitEditing={isLogin ? handleLogin : () => confirmRef.current?.focus()}
            editable={!loading}
          />

          {!isLogin && (
            <TextInput
              ref={confirmRef}
              style={styles.input}
              placeholder="Wachtwoord bevestigen"
              placeholderTextColor="#bbb"
              value={confirmPassword}
              onChangeText={setConfirm}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              editable={!loading}
            />
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.button}
            onPress={isLogin ? handleLogin : handleRegister}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>{isLogin ? 'Inloggen' : 'Account aanmaken'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Switch link */}
        <TouchableOpacity style={styles.switchRow} onPress={() => switchMode(isLogin ? 'register' : 'login')}>
          <Text style={styles.switchText}>
            {isLogin
              ? 'Nog geen account? '
              : 'Al een account? '
            }
            <Text style={styles.switchLink}>
              {isLogin ? 'Aanmelden' : 'Inloggen'}
            </Text>
          </Text>
        </TouchableOpacity>

        {__DEV__ && (
          <Text style={styles.devHint}>Dev: http://192.168.68.108:3000</Text>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },

  header: { alignItems: 'center', marginBottom: 36 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#8B6E6E' },
  subtitle: { fontSize: 15, color: '#999', marginTop: 4 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#f4f0f0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 14, fontWeight: '500', color: '#aaa' },
  tabTextActive: { color: '#8B6E6E', fontWeight: '700' },

  form: { gap: 0 },
  input: {
    borderWidth: 1, borderColor: '#e8e8e8', borderRadius: 8,
    padding: 14, marginBottom: 12, fontSize: 16,
    backgroundColor: '#fafafa', color: '#333',
  },

  errorBox: { backgroundColor: '#fdecea', borderRadius: 8, padding: 12, marginBottom: 10 },
  errorText: { color: '#c0392b', fontSize: 14 },

  button: { backgroundColor: '#8B6E6E', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  switchRow: { alignItems: 'center', marginTop: 24 },
  switchText: { fontSize: 14, color: '#999' },
  switchLink: { color: '#8B6E6E', fontWeight: '600' },

  devHint: { marginTop: 24, color: '#bbb', fontSize: 11, textAlign: 'center' },
});
