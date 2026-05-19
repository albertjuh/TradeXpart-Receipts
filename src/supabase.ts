import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://bdnwexluvzbwawypkiqp.supabase.co"
const supabaseKey = "sb_publishable_ZLYAlvfSLZvFz0XwTClTnQ_jmaHeRyn"

export const supabase = createClient(supabaseUrl, supabaseKey)

export const uploadFile = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false })
  if (error) throw error
  return data
}

export const uploadFileUpsert = async (bucket: string, path: string, file: File) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true })
  if (error) throw error
  return data
}

export const downloadFile = async (bucket: string, path: string) => {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error) throw error
  return data
}

export const getFileUrl = (bucket: string, path: string) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

export const deleteFile = async (bucket: string, path: string) => {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

export const listFiles = async (bucket: string, path: string) => {
  const { data, error } = await supabase.storage.from(bucket).list(path, {
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw error
  return data ?? []
}
