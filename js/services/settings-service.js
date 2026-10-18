import * as repo from '../storage/repository.js';
import { THEMES } from '../storage/local-adapter.js';
import { LIMITS, PRIVACY_OPTIONS } from '../utils/validators.js';

export const SettingsService = {
  options: Object.freeze({
    themes: THEMES,
    privacy: PRIVACY_OPTIONS,
    messageLimit: Object.freeze({ min: LIMITS.MESSAGE_MIN, max: LIMITS.MESSAGE_MAX }),
  }),

  get: () => repo.getSettings(),

  async update(patch) {
    try {
      return { ok: true, settings: await repo.updateSettings(patch) };
    } catch (e) {
      if (e instanceof repo.RepoError) return { ok: false, error: e.message };
      throw e;
    }
  },
};
