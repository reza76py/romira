import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

export default function App() {
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fetchingStudents, setFetchingStudents] = useState(true)
  const [showAgentLog, setShowAgentLog] = useState(false)

  useEffect(() => {
    fetch('/api/students/')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load students (${r.status})`)
        return r.json()
      })
      .then((data) => {
        setStudents(data)
        if (data.length > 0) setSelectedId(String(data[0].id))
      })
      .catch((e) => setError(e.message))
      .finally(() => setFetchingStudents(false))
  }, [])

  const selectedStudent = students.find((s) => String(s.id) === selectedId)

  async function prepareLesson() {
    if (!selectedId) return
    setLoading(true)
    setResult(null)
    setError(null)
    setShowAgentLog(false)
    try {
      const res = await fetch(`/api/agent/prepare-lesson?student_id=${selectedId}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Server error (${res.status})`)
      }
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const plan = result?.lesson_plan
  const log = result?.tool_calls_log

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-indigo-700 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <span className="text-2xl">📚</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">Romira</h1>
            <p className="text-indigo-200 text-sm">AI English Teaching Assistant</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Student selector */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
            Select Student
          </h2>
          {fetchingStudents ? (
            <p className="text-slate-400 text-sm">Loading students…</p>
          ) : students.length === 0 ? (
            <p className="text-slate-400 text-sm">No students found.</p>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1">
                <select
                  value={selectedId}
                  onChange={(e) => { setSelectedId(e.target.value); setResult(null); setError(null) }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {s.level}</option>
                  ))}
                </select>
                {selectedStudent && (
                  <p className="mt-2 text-xs text-slate-400">
                    Reading: <span className="text-slate-600 font-medium">{selectedStudent.book}</span>
                    {selectedStudent.errors?.length > 0 && (
                      <> · {selectedStudent.errors.length} known error{selectedStudent.errors.length !== 1 ? 's' : ''}</>
                    )}
                  </p>
                )}
              </div>
              <button
                onClick={prepareLesson}
                disabled={loading || !selectedId}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold px-5 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                {loading ? <><Spinner />Preparing lesson…</> : 'Prepare Lesson'}
              </button>
            </div>
          )}
        </section>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-3 animate-pulse">
            <div className="h-4 bg-slate-200 rounded w-1/3" />
            <div className="h-3 bg-slate-100 rounded w-full" />
            <div className="h-3 bg-slate-100 rounded w-5/6" />
            <div className="h-3 bg-slate-100 rounded w-4/6" />
            <div className="h-3 bg-slate-100 rounded w-full mt-4" />
            <div className="h-3 bg-slate-100 rounded w-3/4" />
          </section>
        )}

        {/* Lesson plan result */}
        {plan && !loading && (
          <>
            {/* Errors targeted */}
            {plan.errors_targeted?.length > 0 && (
              <section className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-500 mb-3">
                  Errors Targeted
                </h2>
                <div className="flex flex-wrap gap-2">
                  {plan.errors_targeted.map((e, i) => (
                    <span key={i} className="bg-amber-100 text-amber-800 text-xs font-mono px-3 py-1 rounded-full">
                      {e}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Warm-up exercise */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Warm-up Exercise
              </h2>
              <div className="prose prose-slate prose-sm max-w-none">
                <ReactMarkdown>{plan.warm_up_exercise}</ReactMarkdown>
              </div>
            </section>

            {/* Main exercise */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Main Grammar Exercise
              </h2>
              <div className="prose prose-slate prose-sm max-w-none">
                <ReactMarkdown>{plan.main_exercise}</ReactMarkdown>
              </div>
            </section>

            {/* Suggested next topic */}
            {plan.suggested_next_topic && (
              <section className="bg-indigo-50 rounded-2xl border border-indigo-100 p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 mb-2">
                  Suggested Next Topic
                </h2>
                <p className="text-slate-700 text-sm">{plan.suggested_next_topic}</p>
              </section>
            )}

            {/* Agent log toggle */}
            {log?.length > 0 && (
              <section className="bg-slate-100 rounded-2xl border border-slate-200 p-6">
                <button
                  onClick={() => setShowAgentLog(!showAgentLog)}
                  className="text-sm font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-2"
                >
                  <span>{showAgentLog ? '▾' : '▸'}</span>
                  Agent thinking — {log.length} tool calls
                </button>
                {showAgentLog && (
                  <ol className="mt-4 space-y-2">
                    {log.map((call, i) => (
                      <li key={i} className="text-xs text-slate-600 font-mono bg-white rounded-lg px-4 py-2 border border-slate-200">
                        <span className="text-indigo-400 font-bold">{i + 1}. {call.tool}</span>
                        <span className="text-slate-400 ml-2">{JSON.stringify(call.input)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}