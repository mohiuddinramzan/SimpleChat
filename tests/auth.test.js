import { describe, it, assert } from './runner.js';
import { validateEmail, validatePhone, validateDisplayName, validateUsername } from '../js/utils/validators.js';
import { AuthService } from '../js/services/auth-service.js';
import * as repo from '../js/storage/repository.js';
import { localKey } from './helpers.js';

describe('Demo login validation', () => {
  it('rejects malformed emails with a visible message', () => {
    for (const bad of ['', '   ', 'plain', 'a@b', 'a b@c.com', 'a..b@c.com', 'a@b.c']) {
      const r = validateEmail(bad);
      assert.equal(r.ok, false, `email ${JSON.stringify(bad)}`);
      assert.ok(typeof r.error === 'string' && r.error.length > 0, 'error message present');
    }
  });

  it('normalizes a valid email to lowercase', () => {
    const r = validateEmail('  User@Example.COM ');
    assert.ok(r.ok);
    assert.equal(r.value, 'user@example.com');
  });

  it('rejects malformed phone numbers', () => {
    for (const bad of ['', '12345', 'abcdefghi', '1234567890123456', '+88 (017) x 123456']) {
      const r = validatePhone(bad);
      assert.equal(r.ok, false, `phone ${JSON.stringify(bad)}`);
      assert.ok(r.error.length > 0);
    }
  });

  it('accepts and normalizes phone numbers, including Bengali digits', () => {
    const a = validatePhone('+880 1712-345678');
    assert.ok(a.ok);
    assert.equal(a.value, '+8801712345678');
    const b = validatePhone('০১৭১২৩৪৫৬৭৮');
    assert.ok(b.ok);
    assert.equal(b.value, '01712345678');
  });

  it('validates display names and usernames', () => {
    assert.equal(validateDisplayName('').ok, false);
    assert.equal(validateDisplayName('x'.repeat(41)).ok, false);
    const n = validateDisplayName('A\u0000B');
    assert.ok(n.ok);
    assert.equal(n.value, 'AB');
    assert.equal(validateUsername('ab').ok, false);
    assert.equal(validateUsername('Has Space').ok, false);
    assert.equal(validateUsername('Good_Name1').value, 'good_name1');
  });
});

describe('Demo authentication flow', () => {
  it('register → logout → login by email, flagged as demo and unverified', async () => {
    const reg = await AuthService.registerDemo({ displayName: 'Rahim', username: 'rahim', email: 'Rahim@Example.com', phone: '' });
    assert.ok(reg.ok, 'register');
    assert.equal(reg.demo, true);
    assert.equal(reg.verified, false);
    assert.equal(reg.user.email, 'rahim@example.com');
    assert.equal((await AuthService.getCurrentUser()).id, reg.user.id);
    assert.equal(localStorage.getItem(localKey('currentUserId')), reg.user.id, 'session persisted');

    await AuthService.logout();
    assert.equal(await AuthService.getCurrentUser(), null);

    const login = await AuthService.loginDemo({ method: 'email', identifier: ' RAHIM@example.com ' });
    assert.ok(login.ok, 'login');
    assert.equal(login.user.id, reg.user.id);
    assert.equal(login.verified, false);
  });

  it('logs in by phone, also when the number is typed with Bengali digits', async () => {
    const reg = await AuthService.registerDemo({ displayName: 'Sumi', username: 'sumi', phone: '+880 1700-000000' });
    assert.ok(reg.ok);
    assert.equal(reg.user.phone, '+8801700000000');
    await AuthService.logout();
    const login = await AuthService.loginDemo({ method: 'phone', identifier: '+৮৮০১৭০০০০০০০০' });
    assert.ok(login.ok);
    assert.equal(login.user.id, reg.user.id);
  });

  it('shows clear errors for unknown account, bad input and unknown method', async () => {
    const unknown = await AuthService.loginDemo({ method: 'email', identifier: 'nobody@example.com' });
    assert.equal(unknown.ok, false);
    assert.ok(unknown.errors.identifier.length > 0);
    const bad = await AuthService.loginDemo({ method: 'phone', identifier: '12' });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.identifier);
    const method = await AuthService.loginDemo({ method: 'sms', identifier: 'x' });
    assert.equal(method.ok, false);
    assert.ok(method.errors.method);
  });

  it('requires an email or a phone and reports every invalid field', async () => {
    const none = await AuthService.registerDemo({ displayName: 'A', username: 'abc' });
    assert.equal(none.ok, false);
    assert.ok(none.errors.contact);
    const bad = await AuthService.registerDemo({ displayName: '', username: 'a', email: 'bad', phone: '12' });
    assert.equal(bad.ok, false);
    for (const k of ['displayName', 'username', 'email', 'phone']) assert.ok(bad.errors[k], `error for ${k}`);
  });

  it('rejects duplicate username and email', async () => {
    assert.ok((await AuthService.registerDemo({ displayName: 'A', username: 'dup_user', email: 'dup@example.com' })).ok);
    const sameName = await AuthService.registerDemo({ displayName: 'B', username: 'dup_user', email: 'other@example.com' });
    assert.equal(sameName.ok, false);
    assert.ok(sameName.errors.username);
    const sameEmail = await AuthService.registerDemo({ displayName: 'C', username: 'other_user', email: 'dup@example.com' });
    assert.equal(sameEmail.ok, false);
    assert.ok(sameEmail.errors.email);
  });

  it('never stores passwords or OTPs', async () => {
    const reg = await AuthService.registerDemo({
      displayName: 'Safe', username: 'safe_user', email: 'safe@example.com',
      password: 'p@ss-UNIQUE-77', otp: 'OTP-ZZ-4821',
    });
    assert.ok(reg.ok);
    const allowed = ['id', 'displayName', 'username', 'email', 'phone', 'avatarInitials', 'createdAt'];
    assert.deepEqual(Object.keys(reg.user).sort(), [...allowed].sort());
    const json = await repo.exportBackupJson();
    assert.ok(!json.includes('p@ss-UNIQUE-77') && !json.includes('OTP-ZZ-4821'), 'not in database export');
    for (const key of Object.keys(localStorage)) {
      const value = localStorage.getItem(key) || '';
      assert.ok(!value.includes('p@ss-UNIQUE-77') && !value.includes('OTP-ZZ-4821'), `not in localStorage ${key}`);
    }
  });

  it('switchDemoProfile works and rejects unknown profiles', async () => {
    const a = (await AuthService.registerDemo({ displayName: 'A', username: 'user_a', email: 'a@example.com' })).user;
    const b = (await AuthService.registerDemo({ displayName: 'B', username: 'user_b', email: 'b@example.com' })).user;
    assert.equal((await AuthService.getCurrentUser()).id, b.id);
    const sw = await AuthService.switchDemoProfile(a.id);
    assert.ok(sw.ok);
    assert.equal((await AuthService.getCurrentUser()).id, a.id);
    const missing = await AuthService.switchDemoProfile('usr_doesnotexist1');
    assert.equal(missing.ok, false);
    assert.equal((await AuthService.getCurrentUser()).id, a.id, 'session unchanged');
  });

  it('treats a session pointing to a deleted profile as logged out', async () => {
    const a = (await AuthService.registerDemo({ displayName: 'A', username: 'user_a', email: 'a@example.com' })).user;
    await repo.deleteProfile(a.id);
    assert.equal(await AuthService.getCurrentUser(), null);
    assert.equal(localStorage.getItem(localKey('currentUserId')), null, 'stale session removed');
  });

  it('sample profiles are created once, without duplicates', async () => {
    const first = await AuthService.ensureSampleProfiles();
    const second = await AuthService.ensureSampleProfiles();
    assert.equal(first.length, 2);
    assert.equal(second.length, 2);
  });
});
