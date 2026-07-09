import { NextResponse } from 'next/server';
import { handle } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { saveDraft } from '@/lib/drafts';

export const dynamic = 'force-dynamic';

/** Create a draft production. */
export async function POST(request: Request) {
  return handle(async () => {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const { id } = await saveDraft(body, admin.email);
    return NextResponse.json({ id }, { status: 201 });
  });
}
