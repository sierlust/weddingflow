import { api } from './client';
import { BASE_URL, getToken } from './tokenManager';

export interface Document {
  id: string;
  weddingId: string;
  wedding_id?: string;
  filename: string;
  category: string;
  createdAt: string;
  created_at?: string;
  sizeBytes?: number;
  size_bytes?: number;
}

export const documentsApi = {
  list: (weddingId: string): Promise<Document[]> =>
    api.get<{ documents: Document[] }>(`/weddings/${weddingId}/documents`)
      .then((r: any) => r.documents ?? r),

  // File uploads go through the backend (multipart/form-data + XHR progress)
  upload: async (
    weddingId: string,
    file: { uri: string; name: string; mimeType?: string },
    category: string,
    onProgress?: (pct: number) => void,
  ): Promise<Document> => {
    const token = await getToken();
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType ?? 'application/pdf' } as any);
    form.append('category', category);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/weddings/${weddingId}/documents/upload`);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 201) {
          try { resolve(JSON.parse(xhr.responseText).document); }
          catch { reject(new Error('Ongeldig antwoord van server.')); }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error ?? `HTTP ${xhr.status}`)); }
          catch { reject(new Error(`HTTP ${xhr.status}`)); }
        }
      };
      xhr.onerror = () => reject(new Error('Uploadfout. Controleer je verbinding.'));
      xhr.send(form);
    });
  },
};
