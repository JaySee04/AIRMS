'use client';

// 100%-stacked horizontal distribution bar + a counted legend. Replaces a pie:
// proportion reads left-to-right and every slice carries its count and share,
// so the meaning is never colour-alone. Shared by both admin analytics pages.

export interface Seg { label: string; value: number; color: string }

export default function DistributionBar({ segments }: { segments: Seg[] }) {
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', background: 'var(--border)' }}>
        {shown.map((s, i) => (
          <div key={s.label} title={`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color, borderRight: i < shown.length - 1 ? '2px solid var(--bg)' : undefined }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 14 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.85rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span>{s.label}</span><strong>{s.value}</strong>
            <span className="text-muted">({Math.round((s.value / total) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}
