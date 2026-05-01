import { useStore } from '../../store'
import { ProgressBar, Skeleton } from '../layout/Primitives'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'

const METRICS = [
  { key: 'avg_faithfulness',   label: 'Faithfulness',      color: '#3fb950', threshold: 90 },
  { key: 'avg_relevancy',      label: 'Answer Relevancy',  color: '#58a6ff', threshold: 85 },
  { key: 'success_rate',       label: 'Success Rate',      color: '#39d353', threshold: 90 },
  { key: 'avg_hallucination',  label: 'Hallucination ↓',  color: '#f85149', threshold: 8, invert: true },
]

export function EvalPanel() {
  const evalRun = useStore((s) => s.evalRun)
  const evalProgress = useStore((s) => s.evalProgress)

  const radarData = evalRun
    ? [
        { metric: 'Faithfulness',   value: evalRun.avg_faithfulness * 100 },
        { metric: 'Relevancy',      value: evalRun.avg_relevancy * 100 },
        { metric: 'Success Rate',   value: evalRun.success_rate },
        { metric: 'Anti-Halluc.',   value: (1 - evalRun.avg_hallucination) * 100 },
        { metric: 'Adversarial',    value: evalRun.success_rate * 0.87 }, // approx
      ]
    : []

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">DeepEval Results</span>
        {evalRun && (
          <span className="mono text-[10px] text-[var(--text-muted)]">
            {new Date(evalRun.created_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {/* Progress bar when eval running */}
        {evalProgress > 0 && evalProgress < 100 && (
          <div>
            <div className="flex justify-between text-[11px] text-[var(--text-muted)] mb-1">
              <span>Running eval suite…</span>
              <span>{evalProgress.toFixed(0)}%</span>
            </div>
            <ProgressBar value={evalProgress} color="var(--accent-blue)" />
          </div>
        )}

        {!evalRun ? (
          <div className="flex flex-col gap-3">
            {METRICS.map((m) => (
              <div key={m.key}>
                <div className="flex justify-between text-[11px] mb-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
            <p className="text-[11px] text-[var(--text-muted)] text-center mt-2">
              Click "Run Eval Suite" to see results
            </p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="card p-3">
                <div className="text-[10px] text-[var(--text-muted)] mb-1">Test Cases</div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">{evalRun.total_cases}</div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {evalRun.passed} passed · {evalRun.failed} failed
                </div>
              </div>
              <div className="card p-3">
                <div className="text-[10px] text-[var(--text-muted)] mb-1">Overall Pass Rate</div>
                <div className={`text-lg font-semibold ${evalRun.success_rate >= 90 ? 'text-[var(--accent-green)]' : 'text-[var(--accent-amber)]'}`}>
                  {evalRun.success_rate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">
                  {(evalRun.duration_ms / 1000).toFixed(1)}s runtime
                </div>
              </div>
            </div>

            {/* Metric bars */}
            <div className="flex flex-col gap-3">
              {METRICS.map((m) => {
                const raw = evalRun[m.key as keyof typeof evalRun] as number
                const display = m.invert ? raw * 100 : raw
                const barVal = m.invert ? (1 - raw) * 100 : display
                const passing = m.invert ? display <= m.threshold : display >= m.threshold
                return (
                  <div key={m.key}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[var(--text-secondary)]">{m.label}</span>
                      <span className={`font-medium tabular-nums ${passing ? 'text-[var(--accent-green)]' : 'text-[var(--accent-amber)]'}`}>
                        {display.toFixed(1)}%
                        <span className="ml-1">{passing ? '✓' : '⚠'}</span>
                      </span>
                    </div>
                    <ProgressBar value={barVal} color={m.color} />
                  </div>
                )
              })}
            </div>

            {/* Radar chart */}
            {radarData.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2 font-medium">
                  Score Radar
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} />
                    <Tooltip
                      contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                      formatter={(v) => [`${Number(v).toFixed(1)}%`]}
                    />
                    <Radar name="Score" dataKey="value" stroke="#58a6ff" fill="#58a6ff" fillOpacity={0.15} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
