/**
 * Configuració pública de Supabase (apartat Social). La URL i la clau "anon/publishable"
 * estan pensades per anar dins la web: la seguretat la donen les polítiques RLS de
 * supabase/schema.sql. Mai posis aquí la clau service_role / secret.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://cspqwagqhgfhkgnvkdoe.supabase.co';
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcHF3YWdxaGdmaGtnbnZrZG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwNDgyNzgsImV4cCI6MjEwOTYyNDI3OH0.B004B7_Hwy8GYHEoLfPyfzLDB5NNODowCJua-kT5wsI';

/** Adreça pública de la web (enllaços de seguiment en directe). */
export const PUBLIC_URL: string = import.meta.env.VITE_PUBLIC_URL || 'https://marc-cellmm.github.io/motoroute-builder/';
