import { useMemo } from 'react'
import { ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertTriangle, BrainCircuit, RefreshCw } from 'lucide-react'
import { useStationId } from '@/lib/station'
import { useTrendData } from '@/lib/monitoring'
import { useNow } from '@/lib/stationStatus'
import { PREDICTION_STALE_MS, PREDICTION_TAG, useLatestPrediction, usePredictionAccuracy } from '@/lib/predictions'
import { cn, formatRelativeTime, formatTimestamp } from '@/lib/utils'

// ============================================================================
// Prediksi Daya AI: hasil model dari AI Engineer (tabel predictions), terpisah
// dari panel "Estimasi Tren Daya" yang hanya regresi linear. Nilai prediksi
// tidak pernah dicampur dengan data aktual: garis aktual (kuning) dan garis
// prediksi (ungu putus-putus) dibedakan, dan identitas model selalu tampil.
// ============================================================================

const MINUTE = 60_000

export function AiPredictionPanel() {
  const stationId = useStationId()
  const now = useNow(60_000)
  const { data: batch, isLoading, isError } = useLatestPrediction(stationId)
  const { data: accuracy } = usePredictionAccuracy(stationId, 24)

  // Data aktual 60 menit terakhir per menit, diperbarui tiap menit.
  const minute = Math.floor(now / MINUTE) * MINUTE
  const from = new Date(minute - 60 * MINUTE).toISOString()
  const to = new Date(minute + MINUTE).toISOString()
  const { data: actual } = useTrendData(PREDICTION_TAG, from, to, 1)

  const stale = batch != null && now - Date.parse(batch.baseTimestamp) > PREDICTION_STALE_MS

  const chartData = useMemo(() => {
    const points = new Map<number, { t: number; actual?: number; predicted?: number }>()
    for (const point of actual ?? []) {
      if (point.avg_value == null) continue
      const t = Math.floor(Date.parse(point.bucket) / MINUTE) * MINUTE
      points.set(t, { ...points.get(t), t, actual: point.avg_value })
    }
    if (batch && !stale) {
      // Garis prediksi dimulai dari data aktual terakhir yang dipakai model.
      const baseMinute = Math.floor(Date.parse(batch.baseTimestamp) / MINUTE) * MINUTE
      const base = points.get(baseMinute)
      if (base?.actual != null) points.set(baseMinute, { ...base, predicted: base.actual })
      for (const step of batch.steps) {
        const t = Math.floor(Date.parse(step.target_timestamp) / MINUTE) * MINUTE
        points.set(t, { ...points.get(t), t, predicted: step.value })
      }
    }
    return [...points.values()].sort((a, b) => a.t - b.t).map((p) => ({ ...p, time: formatTimestamp(p.t, 'HH:mm') }))
  }, [actual, batch, stale])

  const firstStep = accuracy?.find((row) => batch && row.model === batch.model && row.model_version === batch.modelVersion && row.horizon_step === 1)
  const lastStep = accuracy?.find((row) => batch && row.model === batch.model && row.model_version === batch.modelVersion && row.horizon_step === batch.steps.length)

  return (
    <section className="rounded-card border border-accent-purple/30 bg-surface p-4" aria-label="Prediksi daya AI">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-accent-purple" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-text-primary">Prediksi Daya AI</h2>
            {batch && (
              <span className="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] text-accent-purple">
                {batch.model} · versi {batch.modelVersion}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-text-secondary">
            Daya estimasi beberapa menit ke depan dari 60 data per menit terakhir (level, kecepatan, debit, jarak ke air), dihitung model AI.
          </p>
        </div>
        {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-text-secondary" aria-hidden="true" />}
      </div>

      {isError ? (
        <div className="mt-3 rounded-card border border-accent-orange/30 bg-accent-orange/5 px-3 py-3 text-xs text-accent-orange">
          Data prediksi tidak dapat dimuat.
        </div>
      ) : isLoading ? (
        <div className="mt-3 h-24 skeleton rounded-card" />
      ) : !batch ? (
        <div className="mt-3 rounded-card border border-border bg-surface-2/40 px-3 py-3 text-xs text-text-secondary">
          Prediksi AI belum tersedia untuk stasiun ini. Nilai prediksi akan tampil setelah layanan AI mengirim hasil.
        </div>
      ) : (
        <>
          {stale && (
            <Notice>
              Prediksi terakhir dibuat {formatRelativeTime(batch.baseTimestamp)}. Layanan AI sedang tidak mengirim hasil, jadi prediksi lama tidak digambar.
            </Notice>
          )}
          {!stale && batch.outOfRange && (
            <Notice>
              Kondisi aliran saat ini di luar rentang data latih model. Prediksi kurang dapat dipercaya sampai model dilatih ulang dengan data yang lebih lengkap.
            </Notice>
          )}

          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
            <div className="min-w-0">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="aiActualGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-secondary))' }} unit=" kW" domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 6 }}
                      labelStyle={{ color: 'hsl(var(--text-secondary))', fontSize: 11 }}
                      formatter={(value: number, name: string) => [`${value.toFixed(1)} kW`, name === 'predicted' ? `Prediksi ${batch.model}` : 'Aktual (estimasi dari debit)']}
                    />
                    <Area type="monotone" dataKey="actual" stroke="#fbbf24" strokeWidth={2} fill="url(#aiActualGrad)" dot={false} connectNulls />
                    <Line type="monotone" dataKey="predicted" stroke="#a855f7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: '#a855f7' }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[200px] items-center justify-center rounded-card bg-surface-2/40 text-xs text-text-secondary">Menunggu data daya</div>
              )}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-secondary">
                <span><span className="mr-1 inline-block h-0.5 w-4 bg-[#fbbf24] align-middle" />Aktual</span>
                <span><span className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-[#a855f7] align-middle" />Prediksi {batch.model}</span>
              </div>
            </div>

            <div>
              <ol className={cn('divide-y divide-border rounded-card border border-border', stale && 'opacity-50')}>
                {batch.steps.map((step) => (
                  <li key={step.horizon_step} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="text-text-secondary">
                      +{step.horizon_step} · {formatTimestamp(step.target_timestamp, 'HH:mm')}
                    </span>
                    <span className="font-semibold tabular-nums text-accent-purple">{step.value.toFixed(1)} kW</span>
                  </li>
                ))}
              </ol>
              <dl className="mt-2 space-y-0.5 text-[10px] text-text-secondary">
                <div>Data terakhir yang dipakai: {formatTimestamp(batch.baseTimestamp, 'HH:mm:ss')}</div>
                <div>Dibuat {formatRelativeTime(batch.createdAt)}</div>
                {firstStep && (
                  <div title="Dibandingkan dengan daya aktual pada waktu target, 24 jam terakhir">
                    Galat 24 jam: MAE {fmt(firstStep.mae)} kW (+1){lastStep && lastStep !== firstStep ? ` · ${fmt(lastStep.mae)} kW (+${lastStep.horizon_step})` : ''}
                    {firstStep.mape != null ? ` · MAPE ${fmt(firstStep.mape)}%` : ''} · {firstStep.sample_count} data
                  </div>
                )}
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-card border border-accent-orange/30 bg-accent-orange/5 px-3 py-2 text-[11px] text-accent-orange" role="status">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

function fmt(value: number | null | undefined) {
  return value == null ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: 1 })
}
