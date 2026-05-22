/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string ?? 'https://bdnwexluvzbwawypkiqp.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkbndleGx1dnpid2F3eXBraXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NjkxNzksImV4cCI6MjA5NDQ0NTE3OX0.9N38qiBs3a_qKzOe79YsjELrWwDQvn6lYmNoiEkYiS0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
    storage: window.localStorage,
    storageKey: 'tradexparts-auth',
  },
});

export const uploadFile = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });
  if (error) throw error;
  return data;
};

export const uploadFileUpsert = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true });
  if (error) throw error;
  return data;
};

export const downloadFile = async (bucket: string, path: string) => {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return data;
};

export const getFileUrl = (bucket: string, path: string) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

export const deleteFile = async (bucket: string, path: string) => {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
};

export const listFiles = async (bucket: string, path: string) => {
  const { data, error } = await supabase.storage.from(bucket).list(path, {
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  return data ?? [];
};
