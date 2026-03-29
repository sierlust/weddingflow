import * as SecureStore from 'expo-secure-store';

export const BASE_URL = __DEV__
  ? 'http://192.168.68.108:3000/v1'
  : 'https://jouw-productie-domein.nl/v1';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync('auth_token', accessToken);
  await SecureStore.setItemAsync('refresh_token', refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync('auth_token');
  await SecureStore.deleteItemAsync('refresh_token');
}

export async function tryRefresh(): Promise<boolean> {
  try {
    const refreshToken = await SecureStore.getItemAsync('refresh_token');
    if (!refreshToken) return false;
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await SecureStore.setItemAsync('auth_token', data.accessToken);
    if (data.refreshToken) await SecureStore.setItemAsync('refresh_token', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}
