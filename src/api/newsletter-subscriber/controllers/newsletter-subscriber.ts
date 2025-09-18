// src/api/newsletter-subscriber/controllers/newsletter-subscriber.ts
import { factories } from '@strapi/strapi';
import type { Core } from '@strapi/types'; // ⬅️ namiesto 'Strapi' z @strapi/strapi
import { randomUUID } from 'node:crypto';

const SUB_UID = 'api::newsletter-subscriber.newsletter-subscriber';
const LOG_UID = 'api::newsletter-consent-log.newsletter-consent-log';

export default factories.createCoreController(SUB_UID as any, ({ strapi }) => ({
  async subscribe(ctx) {
    const {
      email,
      source = 'api',
      locale,
      consent_text_version,
      double_opt_in = true,
    } = ctx.request.body || {};

    if (!email) return ctx.badRequest('Missing email');

    const norm = String(email).trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(norm)) return ctx.badRequest('Invalid email');

    const ip = ctx.request.ip;
    const ua = ctx.request.headers['user-agent'] ?? '';

    const [existing] = await (strapi.documents as any)(SUB_UID).findMany({
      filters: { email: norm },
      limit: 1,
    });

    const base = {
      email: norm,
      source,
      locale,
      consent_text_version,
      ip_address: ip,
      user_agent: ua,
      unsubscribed_at: null as Date | null,
    };

    if (double_opt_in) {
      const token = randomUUID();
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const data = {
        ...base,
        double_opt_in: true,
        consent: false,
        doi_token: token,
        doi_expires_at: expires,
      };

      const subscriber =
        existing
          ? await (strapi.documents as any)(SUB_UID).update({
              documentId: (existing as any).documentId,
              data,
            })
          : await (strapi.documents as any)(SUB_UID).create({ data });

      const confirmUrlBase = process.env.PUBLIC_FRONT_URL ?? '';
      const confirmUrl = `${confirmUrlBase}/newsletter/confirm?token=${encodeURIComponent(
        token
      )}`;

      await strapi.plugin('email').service('email').send({
        to: norm,
        subject: 'Potvrďte odber noviniek',
        text: `Potvrďte odber kliknutím: ${confirmUrl}`,
        html: `<p>Prosím, potvrďte odber kliknutím na tlačidlo:</p><p><a href="${confirmUrl}">Potvrdiť odber</a></p>`,
      });

      await logConsent(
        (subscriber as any).documentId,
        'subscribe_request',
        ip,
        ua,
        consent_text_version,
        strapi
      );

      return ctx.send({ ok: true, double_opt_in: true });
    }

    const data = {
      ...base,
      double_opt_in: false,
      consent: true,
      consented_at: new Date(),
      doi_token: null as string | null,
      doi_expires_at: null as Date | null,
    };

    const subscriber =
      existing
        ? await (strapi.documents as any)(SUB_UID).update({
            documentId: (existing as any).documentId,
            data,
          })
        : await (strapi.documents as any)(SUB_UID).create({ data });

    await logConsent(
      (subscriber as any).documentId,
      'subscribe_confirm',
      ip,
      ua,
      consent_text_version,
      strapi
    );

    return ctx.send({ ok: true, double_opt_in: false });
  },

  async confirm(ctx) {
    const token = String(ctx.request.query.token ?? '');
    if (!token) return ctx.badRequest('Missing token');

    const [sub] = await (strapi.documents as any)(SUB_UID).findMany({
      filters: { doi_token: token },
      limit: 1,
    });

    if (!sub) return ctx.notFound('Invalid token');

    const s = sub as any;
    if (s.doi_expires_at && new Date(s.doi_expires_at) < new Date()) {
      return ctx.badRequest('Token expired');
    }

    await (strapi.documents as any)(SUB_UID).update({
      documentId: s.documentId,
      data: {
        consent: true,
        consented_at: new Date(),
        doi_token: null,
        doi_expires_at: null,
      },
    });

    await logConsent(
      s.documentId,
      'subscribe_confirm',
      ctx.request.ip,
      ctx.request.headers['user-agent'] ?? '',
      s.consent_text_version,
      strapi
    );

    return ctx.send({ ok: true });
  },

  async unsubscribe(ctx) {
    const { email } = ctx.request.body || {};
    if (!email) return ctx.badRequest('Missing email');

    const norm = String(email).trim().toLowerCase();

    const [sub] = await (strapi.documents as any)(SUB_UID).findMany({
      filters: { email: norm },
      limit: 1,
    });

    if (!sub) return ctx.notFound('Not found');

    const s = sub as any;

    await (strapi.documents as any)(SUB_UID).update({
      documentId: s.documentId,
      data: {
        unsubscribed_at: new Date(),
        consent: false,
      },
    });

    await logConsent(
      s.documentId,
      'unsubscribe',
      ctx.request.ip,
      ctx.request.headers['user-agent'] ?? '',
      s.consent_text_version,
      strapi
    );

    return ctx.send({ ok: true });
  },
}));

async function logConsent(
  subscriberDocumentId: string,
  event:
    | 'subscribe_request'
    | 'subscribe_confirm'
    | 'unsubscribe'
    | 'resubscribe',
  ip: string,
  ua: string,
  version: string | undefined,
  strapi: Core.Strapi // ⬅️ tu je správny typ
) {
  try {
    await (strapi.documents as any)(LOG_UID).create({
      data: {
        subscriber: { connect: [subscriberDocumentId] },
        event,
        ip_address: ip,
        user_agent: ua,
        consent_text_version: version,
        at: new Date(),
      },
    });
  } catch (e: any) {
    strapi.log.warn(`Consent log failed: ${e?.message || e}`);
  }
}
