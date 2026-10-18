import { runAll, setGlobalBeforeEach, assert } from './runner.js';

const FILES = [
  './auth.test.js', './chat.test.js', './message.test.js', './privacy.test.js',
  './search.test.js', './storage.test.js', './import-validation.test.js', './ui.test.js',
];

const out = document.getElementById('results');

function show(cls, text) {
  const p = document.createElement('pre');
  p.className = cls;
  p.textContent = text;
  out.append(p);
}

async function main() {
  // নিরাপত্তা: আসল ডেটাবেসে কখনো test চালাবে না
  const dbmod = await import('../js/storage/database.js');
  if (dbmod.DB_NAME === 'simplechat-db') {
    show('fail', 'থামানো হয়েছে: test আসল ডেটাবেস ব্যবহার করছে। ধাপ ১-এর দুটি প্যাচ (database.js, local-adapter.js) দিন।');
    return;
  }

  const repo = await import('../js/storage/repository.js');
  const { MessageService } = await import('../js/services/message-service.js');
  const { NotificationService } = await import('../js/services/notification-service.js');
  const { ChatService } = await import('../js/services/chat-service.js');
  const { resetState } = await import('../js/state.js');

  setGlobalBeforeEach(async () => {
    const init = await dbmod.initDatabase();
    assert.ok(init.ok, 'database init failed in beforeEach');
    await repo.clearAllData();
    MessageService.dispose();
    MessageService.configure({ deliveryDelayMs: 5, typingMs: 20 });
    NotificationService.setNativeNotifier(null);
    ChatService.closeChat();
    resetState();
    document.documentElement.setAttribute('data-theme', 'system');
  });

  const loadErrors = [];
  for (const file of FILES) {
    try { await import(file); } catch (error) { loadErrors.push({ file, error }); }
  }

  const grep = new URLSearchParams(location.search).get('grep') || '';
  await runAll({ container: out, loadErrors, grep });
}

main().catch((e) => show('fail', `Test runner ব্যর্থ: ${e && e.stack ? e.stack : e}`));
