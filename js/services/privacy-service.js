import * as repo from '../storage/repository.js';
import { ChatService } from './chat-service.js';
import { NotificationService } from './notification-service.js';

const fail = (error) => ({ ok: false, error });

const deletedProfile = (id) => ({
  id, displayName: 'মুছে ফেলা প্রোফাইল', username: '', avatarInitials: '?', deleted: true,
});

/**
 * Block ও report শুধু এই ডিভাইসের লোকাল রেকর্ড।
 * কোনো সার্ভারে কিছু পাঠানো বা কার্যকর করা হয় না, UI-তে এটা স্পষ্ট লিখতে হবে।
 */
export const PrivacyService = {
  /** Profile screen-এর জন্য: প্রোফাইল + সম্পর্কের অবস্থা */
  async getRelationship(meId, otherId) {
    const profile = await repo.getProfile(otherId);
    if (!profile) {
      return { deleted: true, self: false, profile: deletedProfile(otherId), blockedByMe: false, canChat: false, reason: 'এই প্রোফাইল আর নেই।' };
    }
    if (meId === otherId) {
      return { deleted: false, self: true, profile, blockedByMe: false, canChat: false, reason: null };
    }
    const [blockedByMe, check] = await Promise.all([
      repo.isBlocked(meId, otherId), ChatService.checkInteraction(meId, otherId),
    ]);
    return { deleted: false, self: false, profile, blockedByMe, canChat: check.ok, reason: check.ok ? null : check.reason };
  },

  async block(meId, otherId) {
    if (!meId || !otherId || meId === otherId) return fail('নিজেকে ব্লক করা যাবে না।');
    const other = await repo.getProfile(otherId);
    if (!other) return fail('এই প্রোফাইল আর নেই।');
    await repo.addBlock(meId, otherId);
    try {
      await NotificationService.notifySystem({
        userId: meId, type: 'privacy', title: 'প্রোফাইল ব্লক করা হয়েছে',
        body: `${other.displayName}-কে ব্লক করা হয়েছে (শুধু এই ডিভাইসের ডেমোতে)।`,
      });
    } catch { /* notification ব্যর্থ হলেও block সফল */ }
    return { ok: true };
  },

  async unblock(meId, otherId) {
    const removed = await repo.removeBlock(meId, otherId);
    return removed ? { ok: true } : fail('এই প্রোফাইল ব্লক করা ছিল না।');
  },

  async listBlocked(meId) {
    const [blocks, profiles] = await Promise.all([repo.listBlocks(meId), repo.listProfiles()]);
    const map = new Map(profiles.map((p) => [p.id, p]));
    return blocks.map((b) => ({ block: b, profile: map.get(b.blockedUserId) || deletedProfile(b.blockedUserId) }));
  },

  async report(reporterId, reportedId, reason) {
    if (!reporterId || !reportedId || reporterId === reportedId) return fail('নিজেকে রিপোর্ট করা যাবে না।');
    const other = await repo.getProfile(reportedId);
    if (!other) return fail('এই প্রোফাইল আর নেই।');
    try {
      const report = await repo.addReport({ reporterId, reportedUserId: reportedId, reason });
      return { ok: true, report };
    } catch (e) {
      if (e instanceof repo.RepoError) return fail(e.message);
      throw e;
    }
  },
};
