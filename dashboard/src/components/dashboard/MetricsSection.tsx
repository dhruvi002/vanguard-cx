import { useStore } from '../../store'
import { MetricCard } from '../layout/Primitives'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'

const TOOL_COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39d353', '#ff7b72']

export function MetricsSection() {
  const metrics = useStore((s) => s.metrics)
  const loading = !metrics

  const successRate = metrics ? metrics.success_rate.toFixed(1) + '%' : '—'
  const faithfulness = metrics
    ? (metrics.faithfulness_score <= 1
        ? (metrics.faithfulness_score * 100).toFixed(1)
        : metrics.faithfulness_score.toFixed(1)) + '%'
    : '—'
  const avgRes = metrics
    ? metrics.avg_resolution_ms < 1000
      ? `${Math.round(metrics.avg_resolution_ms)}ms`
      : `${(metrics.avg_resolution_ms / 1000).toFixed(1)}s`
    : '—'

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Success Rate" value={successRate} sub="500+ adversarial cases" color="green" loading={loading} />
        <MetricCard label="Tickets Today" value={metrics ? metrics.total_tickets.toLocaleString() : '—'}
          sub={metrics ? `${metrics.resolved_today} resolved` : ''} loading={loading} />
        <MetricCard label="Avg Resolution" value={avgRes} sub="↓35% from baseline" color="blue" loading={loading} />
        <MetricCard label="Faithfulness" value={faithfulness} sub="DeepEval score" color="amber" loading={loading} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Throughput */}
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3 font-medium">
            Throughput · tickets/min
          </div>
          {metrics?.throughput?.length ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={metrics.throughput} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#58a6ff" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="minute" tick={{ fontSize: 10, fill: '#484f58' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#484f58' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1c2333', border: '1px solid #30363d', borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: '#8b949e' }}
                  itemStyle={{ color: '#58a6ff' }}
                />
                <Area type="monotone" dataKey="count" stroke="#58a6ff" strokeWidth={1.5}
                  fill="url(#tpGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-[var(--text-muted)] text-xs">
              Waiting for data…
            </div>
          )}
        </div>

        {/* Tool call distribution */}
        <div className="card p-4">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-3 font-medium">
            Tool Calls · last hour
          </div>
          {metrics?.tool_stats?.length ? (
            <div className="flex flex-col gap-2">
              {metrics.tool_stats.slice(0, 6).map((t, i) => (
                <div key={t.name} className="flex items-center gap-2">
                  <span className="mono text-[10px] text-[var(--text-secondary)] w-36 truncate">{t.name}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--border)]">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${Math.min(100, (t.calls_per_hr / (metrics.tool_stats[0]?.calls_per_hr || 1)) * 100)}%`,
                        background: TOOL_COLORS[i % TOOL_COLORS.length],
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] tabular-nums w-12 text-right">{t.calls_per_hr}/hr</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[100px] flex items-center justify-center text-[var(--text-muted)] text-xs">
              Waiting for tool data…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
