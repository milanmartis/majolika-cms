import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const APP = process.env.APP_NAME || 'Strapi Admin';
authenticator.options = { window: 1 };

// jednoduché AES-GCM na secret
const ALG = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(process.env.SECRET || 'dev-secret').digest();
const enc = (t) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const c = Buffer.concat([cipher.update(t, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, c]).toString('base64');
};
const dec = (b64) => {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const d = crypto.createDecipheriv(ALG, KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
};

const genCodes = (n = 10) =>
  Array.from({ length: n }, () => (Math.random().toString(36).slice(-5) + '-' + Math.random().toString(36).slice(-5)).toUpperCase());

export default ({ strapi }) => ({
  async getOrCreate(adminUserId) {
    const existing = await strapi.db.query('plugin::admin-mfa.mfa').findOne({ where: { adminUserId } });
    if (existing) return existing;
    return strapi.db.query('plugin::admin-mfa.mfa').create({ data: { adminUserId, enabled: false } });
  },

  async startSetup(adminUser) {
    const rec = await this.getOrCreate(adminUser.id);
    const secret = authenticator.generateSecret();
    await strapi.db.query('plugin::admin-mfa.mfa').update({
      where: { id: rec.id },
      data: { tempSecret: enc(secret) },
    });
    const otpauth = authenticator.keyuri(adminUser.email, APP, secret);
    const qr = await QRCode.toDataURL(otpauth);
    return { otpauth, qr };
  },

  async enable(adminUserId, code) {
    const rec = await this.getOrCreate(adminUserId);
    if (!rec.tempSecret) throw new Error('SETUP_NOT_STARTED');
    const secret = dec(rec.tempSecret);
    const ok = authenticator.verify({ token: code, secret });
    if (!ok) throw new Error('INVALID_CODE');

    const rawCodes = genCodes();
    const hashes = await Promise.all(rawCodes.map((c) => bcrypt.hash(c, 10)));

    await strapi.db.query('plugin::admin-mfa.mfa').update({
      where: { id: rec.id },
      data: { enabled: true, secret: enc(secret), tempSecret: null, backupHashes: hashes },
    });

    return { backupCodes: rawCodes };
  },

  async disable(adminUserId) {
    const rec = await this.getOrCreate(adminUserId);
    await strapi.db.query('plugin::admin-mfa.mfa').update({
      where: { id: rec.id },
      data: { enabled: false, secret: null, tempSecret: null, backupHashes: null },
    });
  },

  async verifyTotp(adminUserId, code) {
    const rec = await this.getOrCreate(adminUserId);
    if (!rec.enabled || !rec.secret) return false;
    const secret = dec(rec.secret);
    return authenticator.verify({ token: code, secret });
  },

  async tryRecovery(adminUserId, backupCode) {
    const rec = await this.getOrCreate(adminUserId);
    if (!rec.backupHashes || !Array.isArray(rec.backupHashes)) return null;
    for (let i = 0; i < rec.backupHashes.length; i++) {
      if (await bcrypt.compare(backupCode, rec.backupHashes[i])) {
        const next = [...rec.backupHashes];
        next.splice(i, 1);
        await strapi.db.query('plugin::admin-mfa.mfa').update({
          where: { id: rec.id },
          data: { backupHashes: next, lastUsedAt: new Date() },
        });
        return true;
      }
    }
    return null;
  },
});
