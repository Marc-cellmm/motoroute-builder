/**
 * Configuració pública de Supabase (apartat Social). La URL i la clau "anon/publishable"
 * estan pensades per anar dins la web: la seguretat la donen les polítiques RLS de
 * supabase/schema.sql. Mai posis aquí la clau service_role / secret.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
