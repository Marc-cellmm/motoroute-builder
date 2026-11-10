/** Foto de perfil rodona; sense foto, la inicial sobre un fons fosc amb vora vermella. */
export default function Avatar({ url, name, size = 40 }: { url?: string | null; name?: string | null; size?: number }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return url ? (
    <img className="avatar-img" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="avatar-img noimg" style={{ width: size, height: size, fontSize: size * 0.44 }} aria-hidden="true">{initial}</span>
  );
}
