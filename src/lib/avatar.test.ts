import { describe, expect, it } from 'vitest';
import { avatarObjectPath, profileInitials, validateAvatarFile } from './avatar';

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('avatar helpers', () => {
  it('keeps every user in their own folder', () => {
    expect(avatarObjectPath('user-a')).toBe('user-a/avatar');
  });

  it('rejects empty, wrong-type, and oversized files', () => {
    expect(validateAvatarFile(file('a.jpg', 'image/jpeg', 0))).toBe('That file is empty.');
    expect(validateAvatarFile(file('a.gif', 'image/gif', 12))).toBe(
      'Use a JPG, PNG, or WebP image.',
    );
    expect(validateAvatarFile(file('a.jpg', 'image/jpeg', 2 * 1024 * 1024 + 1))).toBe(
      'Keep the photo under 2 MB.',
    );
    expect(validateAvatarFile(file('a.png', 'image/png', 80))).toBeNull();
  });

  it('builds initials from the brand, then the email', () => {
    expect(profileInitials('Sunrise Interiors', 'demo@sivesh-pb.com')).toBe('SI');
    expect(profileInitials('LeadScore', 'x@y.com')).toBe('LE');
    expect(profileInitials('  ', 'demo@sivesh-pb.com')).toBe('DE');
    expect(profileInitials('', '')).toBe('?');
  });
});
