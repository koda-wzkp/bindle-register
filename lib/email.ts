import 'server-only';
import { Resend } from 'resend';
import { requiredEnv } from '@/lib/env';
import { buidShareable } from '@/lib/guards';

function resend(): Resend {
  return new Resend(requiredEnv('RESEND_API_KEY'));
}

function from(): string {
  return requiredEnv('EMAIL_FROM');
}

const wrap = (body: string) => `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; color: #1a1a18; line-height: 1.55;">
  ${body}
  <p style="margin-top: 32px; padding-top: 12px; border-top: 1px solid #d8d6cd; font-size: 12px; color: #55554f;">
    Bindle Register — production registration and split signing.
  </p>
</div>`;

export async function sendSigningInvite(opts: {
  to: string;
  name: string;
  title: string;
  link: string;
}): Promise<void> {
  const { error } = await resend().emails.send({
    from: from(),
    to: opts.to,
    subject: `You're named in ${opts.title} — review and sign your split`,
    html: wrap(`
      <p>Hello ${opts.name},</p>
      <p>You are named as a contributor in <em>${opts.title}</em>. The production's
      profit-sharing terms are ready for your review: every contributor, every share,
      and exactly what money enters the pool.</p>
      <p style="margin: 24px 0;">
        <a href="${opts.link}" style="background: #2545b8; color: #ffffff; padding: 10px 18px; text-decoration: none;">Review and sign</a>
      </p>
      <p>This link is personal to you and signs you in — no password, no account to create.
      Nothing is final until every named contributor has signed.</p>
    `),
    text: `Hello ${opts.name},\n\nYou are named as a contributor in ${opts.title}. Review the full split and sign here:\n\n${opts.link}\n\nThis link is personal to you. Nothing is final until every named contributor has signed.`,
  });
  if (error) throw new Error(`signing invite to ${opts.to} failed: ${error.message}`);
}

export async function sendSignatureConfirmation(opts: {
  to: string;
  name: string;
  title: string;
  contentHash: string;
}): Promise<void> {
  const { error } = await resend().emails.send({
    from: from(),
    to: opts.to,
    subject: `Signature recorded — ${opts.title}`,
    html: wrap(`
      <p>Hello ${opts.name},</p>
      <p>Your signature on the terms of <em>${opts.title}</em> is recorded.</p>
      <p>The exact terms you signed are identified by this content hash:</p>
      <p style="font-family: monospace; font-size: 12px; word-break: break-all;">${opts.contentHash}</p>
      <p>When every contributor has signed, the record freezes and you'll receive
      the registered identifier with a verification copy of the terms.</p>
    `),
    text: `Hello ${opts.name},\n\nYour signature on the terms of ${opts.title} is recorded.\nContent hash of the signed terms: ${opts.contentHash}\n\nWhen every contributor has signed, the record freezes and you'll receive the registered identifier with a verification copy of the terms.`,
  });
  if (error) throw new Error(`signature confirmation to ${opts.to} failed: ${error.message}`);
}

export async function sendRegistrationEmail(opts: {
  to: string;
  name: string;
  title: string;
  buid: string;
  recordUrl: string;
  canonicalJson: string;
  glyphSvg: string;
}): Promise<void> {
  if (!buidShareable()) {
    // DECIDE-01 runtime guard: no email may carry a BUID while the namespace
    // segment is the 'TBD' placeholder. Callers must use
    // sendRegistrationEmailNamespacePending instead.
    throw new Error('BUID is not shareable while NAMESPACE_SEGMENT is TBD (DECIDE-01)');
  }
  const { error } = await resend().emails.send({
    from: from(),
    to: opts.to,
    subject: `Registered: ${opts.title} — ${opts.buid}`,
    html: wrap(`
      <p>Hello ${opts.name},</p>
      <p><em>${opts.title}</em> is registered. Every named contributor signed the same
      terms, and the record is now frozen, append-only.</p>
      <p>Its permanent identifier:</p>
      <p style="font-family: monospace; font-size: 13px; word-break: break-all;"><strong>${opts.buid}</strong></p>
      <div style="margin: 20px 0; color: #1a1a18;">${opts.glyphSvg}</div>
      <p><a href="${opts.recordUrl}">View the registered record</a></p>
      <p>The attached <code>canonical.json</code> is your offline verification copy —
      the exact bytes the identifier is derived from. Anyone can recheck it, no
      server required:</p>
      <p style="font-family: monospace; font-size: 12px;">npx bindle-verify canonical.json '${opts.buid}'</p>
    `),
    text: `Hello ${opts.name},\n\n${opts.title} is registered and the record is frozen.\n\nBUID: ${opts.buid}\nRecord: ${opts.recordUrl}\n\nThe attached canonical.json is your offline verification copy. Verify any time with:\n\n  npx bindle-verify canonical.json '${opts.buid}'`,
    attachments: [
      {
        filename: 'canonical.json',
        content: Buffer.from(opts.canonicalJson, 'utf8').toString('base64'),
      },
    ],
  });
  if (error) throw new Error(`registration email to ${opts.to} failed: ${error.message}`);
}

/**
 * Registration notice used while DECIDE-01 is unresolved: carries the
 * canonical JSON and content hash (namespace-independent facts about what
 * was signed) but deliberately no BUID and no record link.
 */
export async function sendRegistrationEmailNamespacePending(opts: {
  to: string;
  name: string;
  title: string;
  contentHash: string;
  canonicalJson: string;
}): Promise<void> {
  const { error } = await resend().emails.send({
    from: from(),
    to: opts.to,
    subject: `Registered: ${opts.title}`,
    html: wrap(`
      <p>Hello ${opts.name},</p>
      <p><em>${opts.title}</em> is registered. Every named contributor signed the same
      terms, and the record is now frozen, append-only.</p>
      <p>The exact terms are identified by this content hash:</p>
      <p style="font-family: monospace; font-size: 12px; word-break: break-all;">${opts.contentHash}</p>
      <p>The attached <code>canonical.json</code> is your verification copy — the exact
      bytes the hash is derived from. The record&rsquo;s permanent public identifier will
      be shared once the registry namespace is finalized; nothing about your signed
      terms can change in the meantime.</p>
    `),
    text: `Hello ${opts.name},\n\n${opts.title} is registered and the record is frozen.\n\nContent hash of the signed terms: ${opts.contentHash}\n\nThe attached canonical.json is your verification copy. The record's permanent public identifier will be shared once the registry namespace is finalized; nothing about your signed terms can change in the meantime.`,
    attachments: [
      {
        filename: 'canonical.json',
        content: Buffer.from(opts.canonicalJson, 'utf8').toString('base64'),
      },
    ],
  });
  if (error) throw new Error(`registration email to ${opts.to} failed: ${error.message}`);
}

export async function sendLoginLink(opts: { to: string; link: string }): Promise<void> {
  const { error } = await resend().emails.send({
    from: from(),
    to: opts.to,
    subject: 'Your Bindle Register sign-in link',
    html: wrap(`
      <p>Sign in to Bindle Register:</p>
      <p style="margin: 24px 0;">
        <a href="${opts.link}" style="background: #2545b8; color: #ffffff; padding: 10px 18px; text-decoration: none;">Sign in</a>
      </p>
      <p>If you didn't request this, ignore this email.</p>
    `),
    text: `Sign in to Bindle Register:\n\n${opts.link}\n\nIf you didn't request this, ignore this email.`,
  });
  if (error) throw new Error(`login link to ${opts.to} failed: ${error.message}`);
}
