const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;

export interface SplitRow {
  name: string;
  role: string;
  bps: number;
  principal: boolean;
  signedAt?: string | null;
}

/**
 * The entire split, visible to every signer — transparency among signers is
 * the design, not a leak (spec §9.2).
 */
export function SplitTable({
  rows,
  commonsRecipient,
  commonsBps,
  showSignatures = false,
}: {
  rows: SplitRow[];
  commonsRecipient: string;
  commonsBps: number;
  showSignatures?: boolean;
}) {
  const total = rows.reduce((sum, r) => sum + r.bps, 0) + commonsBps;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="rule border-b border-ink text-left">
            <th className="py-2 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
              Contributor
            </th>
            <th className="py-2 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
              Role
            </th>
            <th className="py-2 pr-4 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
              Share
            </th>
            {showSignatures && (
              <th className="py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-soft">
                Signature
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-rule">
              <td className="py-2 pr-4">
                {r.name}
                {r.principal && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                    principal
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 text-ink-soft">{r.role}</td>
              <td className="py-2 pr-4 text-right font-mono tabular-nums">{pct(r.bps)}</td>
              {showSignatures && (
                <td className="py-2 text-right font-mono text-[11px]">
                  {r.signedAt ? (
                    <span>signed {new Date(r.signedAt).toLocaleDateString()}</span>
                  ) : (
                    <span className="text-ink-soft">awaiting</span>
                  )}
                </td>
              )}
            </tr>
          ))}
          <tr className="border-b border-rule">
            <td className="py-2 pr-4 italic">Commons — {commonsRecipient}</td>
            <td className="py-2 pr-4 text-ink-soft">Commons</td>
            <td className="py-2 pr-4 text-right font-mono tabular-nums">{pct(commonsBps)}</td>
            {showSignatures && <td />}
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="py-2 pr-4 font-medium">Total</td>
            <td />
            <td className="py-2 pr-4 text-right font-mono font-medium tabular-nums">{pct(total)}</td>
            {showSignatures && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
