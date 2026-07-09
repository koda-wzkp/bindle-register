import type { ProductionStatus } from '@/lib/types';

const LABELS: Record<ProductionStatus, string> = {
  draft: 'Draft',
  open_for_signing: 'Open for signing',
  registered: 'Registered',
  superseded: 'Superseded',
};

const STYLES: Record<ProductionStatus, string> = {
  draft: 'border-rule text-ink-soft',
  open_for_signing: 'border-prompt text-prompt',
  registered: 'border-ink text-ink',
  superseded: 'border-rule text-ink-soft line-through decoration-1',
};

export function StatusBadge({ status }: { status: ProductionStatus }) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
