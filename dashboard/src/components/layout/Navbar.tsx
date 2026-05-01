import { useState } from 'react'
import { clsx } from 'clsx'
import { useStore } from '../../store'
import { api } from '../../lib/api'

export function Navbar() {
  const evalRun = useStore((s) => s.evalRun)
  const setEvalRun = useStore((s) => s.setEvalRun)
  const setEvalProgress = useStore((s) => s.setEvalProgress)
  const [running, setRunning] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [form, setForm] = useState({ subject: '', body: '', customer_email: '' })
  const upsertTicket = useStore((s) => s.upsertTicket)

  async function triggerEval() {
    setRunning(true)
    setEvalProgress(0)
    try {
      await api.eval.trigger()
      // Progress updates come via WebSocket
      setTimeout(() => setRunning(false), 12000)
    } catch {
      setRunning(false)
    }
  }

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subject || !form.customer_email) return
    try {
      const ticket = await api.tickets.create({ ...form, priority: 1 })
      upsertTicket(ticket)
      setForm({ subject: '', body: '', customer_email: '' })
      setSubmitOpen(false)
    } catch {/* noop */}
  }

  return (
    <>
      <header className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-[var(--accent-blue)] flex items-center justify-center text-black text-xs font-black">V</div>
          <span className="font-semibold text-sm tracking-tight text-[var(--text-primary)]">Vanguard-CX</span>
          <span className="text-[var(--text-muted)] text-xs">/ Observability</span>
        </div>

        {/* Center: live indicator */}
        <div className="flex items-center gap-1.5 text-[var(--accent-green)] text-xs">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] live-dot" />
          <span className="mono">LIVE</span>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {evalRun && (
            <span className="text-[var(--text-muted)] text-xs mono">
              eval: {evalRun.success_rate.toFixed(1)}% pass
            </span>
          )}
          <button
            className={clsx('btn', running && 'opacity-60 pointer-events-none')}
            onClick={triggerEval}
          >
            {running ? (
              <><span className="w-3 h-3 border border-current rounded-full border-t-transparent spinner" />Running eval...</>
            ) : (
              <><span>▷</span> Run Eval Suite</>
            )}
          </button>
          <button className="btn-primary" onClick={() => setSubmitOpen(true)}>
            + New Ticket
          </button>
        </div>
      </header>

      {/* Submit ticket modal */}
      {submitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSubmitOpen(false)}>
          <form
            className="card p-5 w-full max-w-md flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitTicket}
          >
            <h2 className="font-semibold text-sm text-[var(--text-primary)]">Submit Test Ticket</h2>
            <input
              className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--accent-blue)] w-full"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Subject (e.g. Order #12345 not delivered)"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              required
            />
            <textarea
              className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--accent-blue)] w-full resize-none"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Ticket body (describe the issue)"
              rows={3}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
            <input
              className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--accent-blue)] w-full"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              placeholder="Customer email"
              type="email"
              value={form.customer_email}
              onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))}
              required
            />
            <div className="flex gap-2 justify-end mt-1">
              <button type="button" className="btn" onClick={() => setSubmitOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Submit & Process</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
