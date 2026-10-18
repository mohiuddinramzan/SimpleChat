import * as repo from '../storage/repository.js';
import { MessageService } from './message-service.js';

export const DataService = {
  getCounts: () => repo.getCounts(),

  async exportBackup() {
    const text = await repo.exportBackupJson();
    const day = new Date().toISOString().slice(0, 10);
    return { ok: true, filename: `simplechat-backup-${day}.json`, text };
  },

  /** কিছু লেখে না; যাচাই করে বর্তমান বনাম নতুন ডেটার সংখ্যা দেয় */
  previewImport: (text) => repo.previewImport(text),

  /** বর্তমান সব ডেটা প্রতিস্থাপন করে। UI-কে আগে confirmation নিতে হবে। */
  async importBackup(text) {
    MessageService.dispose();
    try {
      const counts = await repo.importBackup(text, { confirmReplace: true });
      return { ok: true, counts };
    } catch (e) {
      if (e instanceof repo.RepoError) return { ok: false, error: e.message, details: e.details || [] };
      throw e;
    }
  },

  async clearAll() {
    MessageService.dispose();
    await repo.clearAllData();
    return { ok: true };
  },
};
