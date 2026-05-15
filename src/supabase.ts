import { createClient } from "@supabase/supabase-js"

const supabaseUrl = "https://bdnwexluvzbwawypkiqp.supabase.co"
const supabaseKey = "sb_publishable_ZLYAlvfSLZvFz0XwTClTnQ_jmaHeRyn"

export const supabase = createClient(supabaseUrl, supabaseKey)