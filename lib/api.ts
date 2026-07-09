import 'server-only';
import { NextResponse } from 'next/server';
import { HttpError } from '@/lib/auth';

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Uniform error envelope for route handlers. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return jsonError(e.status, e.message);
    console.error(e);
    return jsonError(500, 'Something went wrong on our side. Try again, and tell your admin if it persists.');
  }
}

export function clientMeta(request: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = request.headers.get('x-forwarded-for');
  return {
    ip: forwarded ? forwarded.split(',')[0].trim() : null,
    userAgent: request.headers.get('user-agent'),
  };
}

/** Only same-app relative paths are allowed as post-login destinations. */
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next;
  return fallback;
}
