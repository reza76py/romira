import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'

export default function App() {
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [fetchingStudents, setFetchingStudents] = useState(true)

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

  async function generateExercise() {
    if (!selectedId) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch(`/api/chat/generate-exercise?student_id=${selectedId}`, {
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="bg-indigo-700 text-white shadow-md">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center gap-3">
          <span className="text-2xl">📚</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">
              Romira
            </h1>
            <p className="text-indigo-200 text-sm">AI English Teaching Assistant</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Student selector card */}
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
                  onChange={(e) => {
                    setSelectedId(e.target.value)
                    setResult(null)
                    setError(null)
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.level}
                    </option>
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
                onClick={generateExercise}
                disabled={loading || !selectedId}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold px-5 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Generating…
                  </>
                ) : (
                  'Generate Exercise'
                )}
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
          </section>
        )}

        {/* Result */}
        {result && !loading && (
          <>
            {/* Exercise */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-4">
                Exercise
              </h2>
              <div className="prose prose-slate prose-sm max-w-none">
                <ReactMarkdown>{result.exercise}</ReactMarkdown>
              </div>
            </section>

            {/* Source sentences */}
            {result.source_sentences?.length > 0 && (
              <section className="bg-indigo-50 rounded-2xl border border-indigo-100 p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 mb-4">
                  From the Book
                </h2>
                <ul className="space-y-2">
                  {result.source_sentences.map((sentence, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-sm text-slate-700 leading-relaxed"
                    >
                      <span className="mt-0.5 text-indigo-300 font-mono text-xs select-none">{i + 1}.</span>
                      <span>{sentence}</span>
                    </li>
                  ))}
                </ul>
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
    <svg
      className="h-4 w-4 animate-spin text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  )
}
