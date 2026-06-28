import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from 'recharts'

const PERSIAN_FONT = { fontFamily: "'Vazirmatn', sans-serif" }

// ─── Login View ───────────────────────────────────────────────────────────────

function LoginView({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/student/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        setError(true)
        return
      }
      const data = await res.json()
      onLogin(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-amber-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Romira</h1>
        <p className="text-slate-400 text-sm mb-8" style={PERSIAN_FONT}>
          دستیار یادگیری انگلیسی
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your code"
            autoFocus
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          {error && (
            <p className="text-red-500 text-sm">Incorrect code. Please try again.</p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-medium py-3 rounded-xl transition-colors"
          >
            {loading ? 'Checking...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Student View ────────────────────────────────────────────────────────────

function StudentView({ student, onExit }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [revealed, setRevealed] = useState({ books: false, grammar: false, practice: false })
  const [error, setError] = useState(null)
  const [practiceAnswers, setPracticeAnswers] = useState({})
  const [showCorrections, setShowCorrections] = useState(false)
  const [feedback, setFeedback] = useState({})
  const [checkingAnswers, setCheckingAnswers] = useState(false)

  async function handleSend() {
    if (!input.trim() || loading) return
    setLoading(true)
    setResult(null)
    setRevealed({ books: false, grammar: false, practice: false })
    setError(null)
    try {
      const res = await fetch('/api/student/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: student.id, persian_input: input.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `خطا (${res.status})`)
      }
      const data = await res.json()
      setResult(data)
      setPracticeAnswers({})
      setShowCorrections(false)
      setFeedback({})
      setCheckingAnswers(false)
      setInput('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function reveal(key) {
    setRevealed((r) => ({ ...r, [key]: true }))
  }

  async function handleCheckAnswers() {
    setCheckingAnswers(true)
    const newFeedback = {}

    for (let i = 0; i < result.practice_exercises.length; i++) {
      const ex = result.practice_exercises[i]
      const parts = ex.split(' | ')
      const correctAnswer = (parts[1] || '').trim().toLowerCase()
      const userAnswer = (practiceAnswers[i] || '').trim().toLowerCase()
      const isCorrect = userAnswer === correctAnswer

      if (isCorrect) {
        newFeedback[i] = { status: 'correct', retryData: null, retryAnswer: '', retryChecked: false, retryFeedback: null }
      } else {
        try {
          const res = await fetch('/api/student/retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: student.id,
              wrong_answer: practiceAnswers[i] || '',
              correct_answer: parts[1] || '',
              grammar_point: result.grammar_point,
            }),
          })
          const data = await res.json()
          newFeedback[i] = { status: 'wrong', retryData: data, retryAnswer: '', retryChecked: false, retryFeedback: null, showRetry: false }
        } catch {
          newFeedback[i] = { status: 'wrong', retryData: null, retryAnswer: '', retryChecked: false, retryFeedback: null, showRetry: false }
        }
      }
    }

    setFeedback(newFeedback)
    setCheckingAnswers(false)
  }

  return (
    <div className="flex flex-col bg-amber-50" style={{ height: '100dvh' }}>
      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-3 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-base font-bold leading-tight">Romira</h1>
          <p className="text-teal-200 text-xs" style={PERSIAN_FONT}>
            دستیار یادگیری انگلیسی
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-teal-100 font-medium">Hello, {student.name} 👋</span>
          <button
            onClick={onExit}
            className="text-xs text-teal-200 hover:text-white border border-teal-500 hover:border-teal-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Scrollable main content */}
      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600" style={PERSIAN_FONT}>
            {error}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Translation */}
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 fade-in">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Translation</p>
              <p className="text-slate-800 text-base leading-relaxed">{result.english_translation}</p>
            </div>

            {/* Book sentences */}
            {!revealed.books ? (
              <button
                onClick={() => reveal('books')}
                className="w-full text-left bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm text-teal-700 font-medium transition-colors"
              >
                Similar sentences from the book 📖
              </button>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 space-y-2 fade-in">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">From the Book</p>
                {result.book_sentences.map((s, i) => (
                  <p key={i} className="text-slate-700 text-sm leading-relaxed border-l-2 border-teal-300 pl-3">
                    {s}
                  </p>
                ))}
              </div>
            )}

            {/* Grammar */}
            {revealed.books && !revealed.grammar ? (
              <button
                onClick={() => reveal('grammar')}
                className="w-full text-left bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm text-teal-700 font-medium transition-colors"
              >
                Grammar points ✏️
              </button>
            ) : revealed.grammar ? (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 fade-in">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Grammar Point</p>
                <div className="space-y-3">
                  {result.grammar_point
                    .split('\n')
                    .filter(line => line.trim().length > 0)
                    .reduce((pairs, line, idx, arr) => {
                      if (idx % 2 === 0) pairs.push([line, arr[idx + 1] || ''])
                      return pairs
                    }, [])
                    .map((pair, pi) => (
                      <div key={pi} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-6">
                        <p className="text-slate-800 text-sm leading-relaxed sm:w-1/2">{pair[0]}</p>
                        <p className="text-slate-500 text-sm leading-relaxed sm:w-1/2" dir="rtl" style={PERSIAN_FONT}>{pair[1]}</p>
                      </div>
                    ))
                  }
                </div>
              </div>
            ) : null}

            {/* Practice */}
            {revealed.grammar && !revealed.practice ? (
              <button
                onClick={() => reveal('practice')}
                className="w-full text-left bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3 text-sm text-teal-700 font-medium transition-colors"
              >
                Practice 📝
              </button>
            ) : revealed.practice ? (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 fade-in">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Practice</p>
                <div className="space-y-5">
                  {result.practice_exercises.map((ex, i) => {
                    const prompt = ex.split(' | ')[0]
                    const fb = feedback[i]
                    return (
                      <div key={i} className="space-y-2">
                        <div className="flex flex-col gap-1.5">
                          <p className="text-slate-800 text-sm">{prompt}</p>
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={practiceAnswers[i] || ''}
                              onChange={(e) =>
                                setPracticeAnswers((a) => ({ ...a, [i]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && Object.keys(feedback).length === 0) handleCheckAnswers()
                              }}
                              disabled={!!fb}
                              placeholder="Your answer..."
                              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
                            />
                          </div>
                        </div>

                        {/* Feedback */}
                        {fb && (
                          <div className="ml-6">
                            {fb.status === 'correct' ? (
                              <p className="text-emerald-600 text-sm font-medium">✓ Correct!</p>
                            ) : (
                              <div className="space-y-3">
                                <p className="text-red-500 text-sm font-medium">
                                  ✗ Correct answer: <span className="font-bold">{(ex.split(' | ')[1] || '').trim()}</span>
                                </p>

                                {fb.retryData && (
                                  <div className="bg-violet-50 rounded-xl px-4 py-3">
                                    <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-2">Explanation</p>
                                    <p className="text-slate-700 text-sm leading-relaxed" dir="rtl" style={PERSIAN_FONT}>
                                      {fb.retryData.simpler_explanation}
                                    </p>
                                  </div>
                                )}

                                {fb.retryData && !fb.showRetry && (
                                  <button
                                    onClick={() => setFeedback(prev => ({ ...prev, [i]: { ...prev[i], showRetry: true } }))}
                                    className="text-sm bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium px-4 py-2 rounded-xl transition-colors"
                                  >
                                    Try again →
                                  </button>
                                )}

                                {fb.showRetry && fb.retryData && (
                                  <div className="space-y-2 bg-emerald-50 rounded-xl px-4 py-3">
                                    <p className="text-slate-700 text-sm">{fb.retryData.new_practice.split(' | ')[0]}</p>
                                    <input
                                      type="text"
                                      value={fb.retryAnswer}
                                      onChange={(e) => setFeedback(prev => ({ ...prev, [i]: { ...prev[i], retryAnswer: e.target.value } }))}
                                      placeholder="Your answer..."
                                      disabled={fb.retryChecked}
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                                    />
                                    {!fb.retryChecked ? (
                                      <button
                                        onClick={async () => {
                                          const correct = (fb.retryData.new_practice.split(' | ')[1] || '').trim().toLowerCase()
                                          const userAns = fb.retryAnswer.trim().toLowerCase()
                                          if (userAns === correct) {
                                            setFeedback(prev => ({
                                              ...prev,
                                              [i]: { ...prev[i], retryChecked: true, retryFeedback: 'correct' }
                                            }))
                                          } else {
                                            try {
                                              const res = await fetch('/api/student/retry', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                  student_id: student.id,
                                                  wrong_answer: fb.retryAnswer,
                                                  correct_answer: fb.retryData.new_practice.split(' | ')[1] || '',
                                                  grammar_point: result.grammar_point
                                                })
                                              })
                                              const newData = await res.json()
                                              setFeedback(prev => ({
                                                ...prev,
                                                [i]: {
                                                  ...prev[i],
                                                  retryData: { ...newData },
                                                  retryAnswer: '',
                                                  retryChecked: false,
                                                  retryFeedback: null
                                                }
                                              }))
                                            } catch {
                                              setFeedback(prev => ({
                                                ...prev,
                                                [i]: { ...prev[i], retryChecked: true, retryFeedback: 'wrong' }
                                              }))
                                            }
                                          }
                                        }}
                                        className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-xl transition-colors"
                                      >
                                        Check
                                      </button>
                                    ) : (
                                      <p className="text-sm font-medium text-emerald-600">✓ Well done!</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {Object.keys(feedback).length === 0 && (
                  <button
                    onClick={handleCheckAnswers}
                    disabled={checkingAnswers}
                    className="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
                  >
                    {checkingAnswers ? 'Checking...' : 'Check Answers'}
                  </button>
                )}

                {Object.keys(feedback).length === result.practice_exercises.length &&
                  Object.values(feedback).every(f => f.status === 'correct') && (
                  <p className="mt-4 text-center text-sm text-emerald-600 font-medium">
                    🎉 All correct! Great work!
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </main>

      {/* Input — sticky footer */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 pt-3 pb-4">
        <div className="flex gap-2 items-end">
          <textarea
            dir="rtl"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="اینجا بنویس..."
            rows={2}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 text-base resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent disabled:bg-slate-50"
            style={PERSIAN_FONT}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
            style={PERSIAN_FONT}
          >
            ارسال
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Teacher View ────────────────────────────────────────────────────────────

function TeacherView() {
  const [password, setPassword] = useState('')
  const [isAuthed, setIsAuthed] = useState(false)
  const [authError, setAuthError] = useState(false)
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [interactions, setInteractions] = useState([])
  const [errors, setErrors] = useState([])
  const [loadingData, setLoadingData] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [shownPassword, setShownPassword] = useState(null)
  const [loadingPassword, setLoadingPassword] = useState(false)

  function handleLogin(e) {
    e.preventDefault()
    if (password === 'romira2025') {
      setIsAuthed(true)
      setAuthError(false)
    } else {
      setAuthError(true)
    }
  }

  useEffect(() => {
    if (!isAuthed) return
    fetch('/api/students/')
      .then((r) => r.json())
      .then((data) => {
        setStudents(data)
        if (data.length > 0) setSelectedId(String(data[0].id))
      })
  }, [isAuthed])

  useEffect(() => {
    if (!selectedId || !isAuthed) return
    setLoadingData(true)
    setPasswordSaved(false)
    setNewPassword('')
    setShownPassword(null)
    setErrors([])
    Promise.all([
      fetch(`/api/student/${selectedId}/interactions`).then((r) => r.json()),
      fetch(`/api/student/${selectedId}/errors`).then((r) => r.json()),
    ])
      .then(([interactionsData, errorsData]) => {
        setInteractions(interactionsData)
        setErrors(errorsData)
      })
      .finally(() => setLoadingData(false))
  }, [selectedId, isAuthed])

  async function handleSetPassword(e) {
    e.preventDefault()
    if (!newPassword || !selectedId) return
    const res = await fetch(`/api/student/${selectedId}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    if (res.ok) {
      setPasswordSaved(true)
      setNewPassword('')
      setShownPassword(null)
    }
  }

  async function handleShowPassword() {
    if (shownPassword !== null) { setShownPassword(null); return }
    setLoadingPassword(true)
    try {
      const res = await fetch(`/api/student/${selectedId}/password`)
      const data = await res.json()
      setShownPassword(data.password || '(not set)')
    } finally {
      setLoadingPassword(false)
    }
  }

  // ── Derived data for charts ──────────────────────────────────────────────

  const selectedStudent = students.find((s) => String(s.id) === selectedId)

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const thisWeekCount = interactions.filter((i) => new Date(i.created_at) >= oneWeekAgo).length

  // Activity: sessions per day over last 14 days
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (13 - i))
    return d.toISOString().slice(0, 10)
  })
  const activityByDate = {}
  interactions.forEach(({ created_at }) => {
    const date = new Date(created_at).toISOString().slice(0, 10)
    activityByDate[date] = (activityByDate[date] || 0) + 1
  })
  const activityData = last14Days.map((date) => ({
    date: date.slice(5), // MM-DD
    sessions: activityByDate[date] || 0,
  }))

  // Errors per day (last 14 days)
  const errorsByDate = {}
  errors.forEach(({ noted_at }) => {
    const date = new Date(noted_at).toISOString().slice(0, 10)
    errorsByDate[date] = (errorsByDate[date] || 0) + 1
  })
  const errorsPerDayData = last14Days.map((date) => ({
    date: date.slice(5),
    errors: errorsByDate[date] || 0,
  }))

  // Error trend: cumulative running total sorted by date
  const errorTrendData = [...errors]
    .sort((a, b) => new Date(a.noted_at) - new Date(b.noted_at))
    .map((err, i) => ({
      date: new Date(err.noted_at).toISOString().slice(5, 10),
      total: i + 1,
    }))

  // Grammar topics: first non-empty line of grammar_point, count by topic
  const grammarCounts = {}
  interactions.forEach(({ grammar_point }) => {
    if (!grammar_point) return
    const firstLine = grammar_point.split('\n').find((l) => l.trim()) || ''
    const topic = firstLine.length > 30 ? firstLine.slice(0, 30) + '…' : firstLine
    if (topic) grammarCounts[topic] = (grammarCounts[topic] || 0) + 1
  })
  const grammarChartData = Object.entries(grammarCounts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)

  const firstGrammarLine = (gp) => (gp || '').split('\n').find((l) => l.trim()) || ''

  // ── Login screen ─────────────────────────────────────────────────────────

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-slate-800 mb-6">Teacher Dashboard</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            {authError && (
              <p className="text-red-500 text-sm">Incorrect password</p>
            )}
            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2.5 rounded-xl transition-colors"
            >
              Login
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
              ← Back to student view
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Authenticated dashboard ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-base font-bold text-slate-800">Romira — Teacher Dashboard</h1>
        <Link to="/" className="text-sm text-teal-600 hover:text-teal-800 transition-colors">
          ← Student view
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── Section 1: Student Info ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          {/* Selector + stats */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-500">Student</label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {students.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-4 text-sm text-slate-500">
              <span>This week: <span className="font-semibold text-slate-700">{thisWeekCount}</span></span>
              <span>Total: <span className="font-semibold text-slate-700">{interactions.length}</span></span>
            </div>
          </div>

          {/* Student info */}
          {selectedStudent && (
            <div className="flex gap-6 text-sm pt-1 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Level</p>
                <p className="text-slate-700 font-medium">{selectedStudent.level || 'Not assessed yet'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-0.5">Book</p>
                <p className="text-slate-700 font-medium">{selectedStudent.book}</p>
              </div>
            </div>
          )}

          {/* Password management */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <form onSubmit={handleSetPassword} className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-500 shrink-0">Set password</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordSaved(false) }}
                placeholder="New code..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
              />
              <button
                type="submit"
                disabled={!newPassword}
                className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shrink-0"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleShowPassword}
                disabled={loadingPassword}
                className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                {loadingPassword ? '...' : shownPassword !== null ? 'Hide' : 'Show'}
              </button>
            </form>
            {passwordSaved && <p className="text-emerald-600 text-sm">Password updated ✓</p>}
            {shownPassword !== null && (
              <p className="text-sm text-slate-700">
                Current code: <span className="font-mono font-semibold">{shownPassword}</span>
              </p>
            )}
          </div>
        </div>

        {loadingData ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Section 2: Activity Chart ───────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Activity — last 14 days</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={activityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    labelStyle={{ color: '#475569' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sessions"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#0d9488' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* ── Chart A: Errors per Session ──────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700">Errors per Session</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">How many mistakes were made each session — lower is better</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={errorsPerDayData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} labelStyle={{ color: '#475569' }} />
                  <Bar dataKey="errors" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── Chart B: Error Trend ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700">Error Trend</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Total errors caught over time — flattening curve means improvement</p>
              {errorTrendData.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No errors recorded yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={errorTrendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} labelStyle={{ color: '#475569' }} />
                    <Line type="monotone" dataKey="total" stroke="#0d9488" strokeWidth={2} dot={{ r: 3, fill: '#0d9488' }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Chart C: What's Being Practiced ──────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700">What's Being Practiced</h2>
              <p className="text-xs text-slate-400 mt-0.5 mb-4">Grammar topics covered in sessions — wider bar = more practice</p>
              {grammarChartData.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">No sessions yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(200, grammarChartData.length * 40)}>
                  <BarChart layout="vertical" data={grammarChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <YAxis type="category" dataKey="topic" width={160} tick={{ fontSize: 11 }} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ── Session History ───────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-700 mb-3">Session History</h2>
              {interactions.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-6">No sessions yet for this student.</p>
              ) : (
                <div>
                  <div className="grid grid-cols-4 gap-3 pb-2 border-b border-slate-100">
                    <p className="text-xs uppercase text-slate-400">Time</p>
                    <p className="text-xs uppercase text-slate-400">Persian</p>
                    <p className="text-xs uppercase text-slate-400">English</p>
                    <p className="text-xs uppercase text-slate-400">Grammar Topic</p>
                  </div>
                  {interactions.map((interaction) => (
                    <div key={interaction.id} className="grid grid-cols-4 gap-3 py-2 border-b border-slate-100">
                      <p className="text-sm text-slate-700 truncate">{new Date(interaction.created_at).toLocaleString()}</p>
                      <p className="text-sm text-slate-700 truncate" dir="rtl" style={PERSIAN_FONT}>{interaction.persian_input}</p>
                      <p className="text-sm text-slate-700 truncate">{interaction.english_translation}</p>
                      <p className="text-sm text-slate-700 truncate">{firstGrammarLine(interaction.grammar_point)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

function App() {
  const [loggedInStudent, setLoggedInStudent] = useState(null)

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/teacher" element={<TeacherView />} />
        <Route
          path="/*"
          element={
            loggedInStudent
              ? <StudentView student={loggedInStudent} onExit={() => setLoggedInStudent(null)} />
              : <LoginView onLogin={setLoggedInStudent} />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
