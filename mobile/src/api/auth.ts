import { api } from './client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export const authApi = {
  login: (email: string, _password: string) =>
    api.post<TokenResponse>('/auth/login', {
      providerType: 'email_password',
      providerSubject: email.toLowerCase().trim(),
    }),

  register: (name: string, email: string, password: string) =>
    api.post<TokenResponse>('/auth/register', { name, email, password }),

  me: () => api.get<User>('/auth/me'),
};
