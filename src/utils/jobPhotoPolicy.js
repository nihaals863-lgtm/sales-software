/**
 * Job site photos: visibility by viewer role (APK admin / worker / guest).
 * Set `JobPhoto.type` on upload (default BEFORE in schema; APK sends SITE / PROGRESS).
 */
const ADMIN_ONLY_TYPES = new Set(['ADMIN_ONLY']);

/** Types safe for public / guest map & unauthenticated clients */
const GUEST_VISIBLE_TYPES = new Set(['BEFORE', 'AFTER', 'PROGRESS', 'PUBLIC', 'SITE']);

function normalizeType(photo) {
  return String(photo?.type || 'BEFORE').toUpperCase();
}

/**
 * Internal / compliance-sensitive — hide from guests; workers on the job may still see.
 */
function isInternalType(t) {
  return t === 'INTERNAL' || t === 'COMPLIANCE_PRIVATE';
}

/**
 * @param {Array<{ type?: string }>} photos
 * @param {{ role: string, userId?: string, jobWorkerId?: string }} ctx
 */
function filterJobPhotosForRole(photos, ctx) {
  if (!Array.isArray(photos)) return [];
  let { role, userId, jobWorkerId } = ctx;
  if (role === 'CUSTOMER') role = 'GUEST';

  if (role === 'ADMIN') return photos;

  const assignedWorker = role === 'WORKER' && userId && jobWorkerId && userId === jobWorkerId;
  if (assignedWorker) {
    return photos.filter((p) => !ADMIN_ONLY_TYPES.has(normalizeType(p)));
  }

  return photos.filter((p) => {
    const t = normalizeType(p);
    if (ADMIN_ONLY_TYPES.has(t) || isInternalType(t)) return false;
    return GUEST_VISIBLE_TYPES.has(t);
  });
}

module.exports = {
  filterJobPhotosForRole,
  normalizeType,
  GUEST_VISIBLE_TYPES,
};
