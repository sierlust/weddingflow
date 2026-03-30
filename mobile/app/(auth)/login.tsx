import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, TextInput as RNTextInput,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../../src/context/AuthContext';

WebBrowser.maybeCompleteAuthSession();

// ─── Configuratie ─────────────────────────────────────────────────────────────
// Vul jouw Google Client IDs in (zie README voor setup-instructies)
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

type Mode = 'login' | 'register';

export default function LoginScreen() {
  const { login, register, oauthLogin } = useAuth();
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

  // ─── Google OAuth ────────────────────────────────────────────────────────────
  const [googleRequest, googleResponse, promptGoogle] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (googleRequest?.redirectUri) {
      console.log('[OAuth] Google redirect URI:', googleRequest.redirectUri);
    }
  }, [googleRequest?.redirectUri]);

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = googleResponse.params?.id_token;
      if (idToken) {
        handleOAuthToken('google', idToken);
      } else {
        setError('Google login mislukt: geen token ontvangen.');
      }
    } else if (googleResponse?.type === 'error') {
      setError('Google login geannuleerd of mislukt.');
    }
  }, [googleResponse]);

  async function handleOAuthToken(provider: 'google' | 'apple', idToken: string) {
    setError('');
    setLoading(true);
    try {
      await oauthLogin(provider, idToken);
    } catch (e: any) {
      setError(e?.message ?? 'Inloggen mislukt.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Apple OAuth ─────────────────────────────────────────────────────────────
  async function handleAppleSignIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        await handleOAuthToken('apple', credential.identityToken);
      } else {
        setError('Apple login mislukt: geen token ontvangen.');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError(e?.message ?? 'Apple login mislukt.');
      }
    }
  }

  // ─── Email/wachtwoord ────────────────────────────────────────────────────────
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
      setError(e?.message ?? 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!name.trim()) { setError('Vul je naam in.'); return; }
    if (!email.trim()) { setError('Vul je e-mailadres in.'); return; }
    if (password.length < 6) { setError('Wachtwoord moet minimaal 6 tekens zijn.'); return; }
    if (password !== confirmPassword) { setError('Wachtwoorden komen niet overeen.'); return; }
    setError('');
    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(e?.message ?? 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === 'login';
  const googleReady = !!GOOGLE_WEB_CLIENT_ID;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.header}>
          <Text style={styles.title}>WeddingFlow</Text>
          <Text style={styles.subtitle}>Leveranciersportaal</Text>
        </View>

        {/* OAuth knoppen */}
        <View style={styles.oauthSection}>
          {googleReady && (
            <TouchableOpacity
              style={styles.oauthBtn}
              onPress={() => promptGoogle()}
              disabled={!googleRequest || loading}
            >
              <Text style={styles.oauthBtnIcon}>G</Text>
              <Text style={styles.oauthBtnText}>Doorgaan met Google</Text>
            </TouchableOpacity>
          )}

          {Platform.OS === 'ios' && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          )}
        </View>

        {/* Scheidingslijn */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>of</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Mode tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, isLogin && styles.tabActive]} onPress={() => switchMode('login')}>
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>Inloggen</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, !isLogin && styles.tabActive]} onPress={() => switchMode('register')}>
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>Account aanmaken</Text>
          </TouchableOpacity>
        </View>

        {/* Formulier */}
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

        <TouchableOpacity style={styles.switchRow} onPress={() => switchMode(isLogin ? 'register' : 'login')}>
          <Text style={styles.switchText}>
            {isLogin ? 'Nog geen account? ' : 'Al een account? '}
            <Text style={styles.switchLink}>{isLogin ? 'Aanmelden' : 'Inloggen'}</Text>
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

  header: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#8B6E6E' },
  subtitle: { fontSize: 15, color: '#999', marginTop: 4 },

  oauthSection: { gap: 12, marginBottom: 4 },
  oauthBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 8,
    paddingVertical: 13, gap: 10, backgroundColor: '#fff',
  },
  oauthBtnIcon: { fontSize: 16, fontWeight: '700', color: '#4285F4', width: 20, textAlign: 'center' },
  oauthBtnText: { fontSize: 15, fontWeight: '600', color: '#333' },
  appleBtn: { width: '100%', height: 48 },

  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#eee' },
  dividerText: { color: '#bbb', fontSize: 13 },

  tabs: {
    flexDirection: 'row', backgroundColor: '#f4f0f0',
    borderRadius: 10, padding: 4, marginBottom: 20,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
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

  switchRow: { alignItems: 'center', marginTop: 20 },
  switchText: { fontSize: 14, color: '#999' },
  switchLink: { color: '#8B6E6E', fontWeight: '600' },

  devHint: { marginTop: 20, color: '#bbb', fontSize: 11, textAlign: 'center' },
});
