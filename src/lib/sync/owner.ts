/**
 * Which account the wardrobe on this phone belongs to.
 *
 * The local data remembers the user id it was last synced for (its "owner"). When someone
 * signs in:
 * - no owner yet (first sign-in on this phone, or data from the older no-login version, or
 *   kept after the owner deleted their account) → the account adopts it and sync merges it in;
 * - the same owner → nothing changes;
 * - a different owner → the local data belongs to someone else. It is removed from the phone
 *   before syncing, so it never reaches the new account; the new account's own data comes
 *   down from the cloud.
 *
 * No platform imports here, so it runs under plain Node for tests.
 */

export type OwnerAction = 'adopt' | 'keep' | 'reset';

export function ownerAction(ownerId: string | null | undefined, uid: string): OwnerAction {
  if (!ownerId) return 'adopt';
  return ownerId === uid ? 'keep' : 'reset';
}
