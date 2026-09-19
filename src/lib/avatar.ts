export const AVATAR_BUCKET = 'avatars';
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

const AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** One object per user so a later upload replaces the previous file. */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar`;
}

export function validateAvatarFile(file: File): string | null {
  if (file.size <= 0) return 'That file is empty.';
  if (!AVATAR_MIME.has(file.type)) return 'Use a JPG, PNG, or WebP image.';
  if (file.size > AVATAR_MAX_BYTES) return 'Keep the photo under 2 MB.';
  return null;
}

export function profileInitials(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromName = (name ?? '').trim();
  if (fromName) {
    const parts = fromName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fromName.slice(0, 2).toUpperCase();
  }
  const local = (email ?? '').split('@')[0]?.trim() ?? '';
  return (local.slice(0, 2) || '?').toUpperCase();
}
