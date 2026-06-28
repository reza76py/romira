import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'

const PERSIAN_FONT = { fontFamily: "'Vazirmatn', sans-serif" }

// ─── Student View ────────────────────────────────────────────────────────────

function StudentView() {
  const [students, setStudents] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [revealed, setRevealed] = useState({ books: false, grammar: false, practice: false })
  const [error, setError] = useState(null)
  const [practiceAnswers, setPracticeAnswers] = useState({})
  const [showCorrections, setShowCorrections] = useState(false)
  const [feedback, setFeedback] = useState({})
  const [checkingAnswers, setCheckingAnswers] = useState(false)

  useEffect(() => {
    fetch('/api/students/')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setStudents(data)
        if (data.length > 0) setSelectedId(String(data[0].id))
      })
      .catch(() => setError('خطا در بارگذاری دانش‌آموزان'))
  }, [])

  const selectedStudent = students.find((s) => String(s.id) === selectedId)

  async function handleSend() {
    if (!input.trim() || !selectedId || loading) return
    setLoading(true)
    setResult(null)
    setRevealed({ books: false, grammar: false, practice: false })
    setError(null)
    try {
      const res = await fetch('/api/student/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: parseInt(selectedId), persian_input: input.trim() }),
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
              student_id: parseInt(selectedId),
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
          {students.length > 0 && (
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value)
                setResult(null)
                setError(null)
              }}
              className="text-sm text-teal-900 bg-white rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <Link
            to="/teacher"
            className="text-xs text-teal-200 hover:text-white transition-colors"
            style={PERSIAN_FONT}
          >
            معلم
          </Link>
        </div>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Welcome state */}
        {!result && !loading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-10">
            <p className="text-4xl mb-4">👋</p>
            <p className="text-slate-500 text-base leading-relaxed" style={PERSIAN_FONT}>
              سلام {selectedStudent?.name || 'رویا'}!
            </p>
            <p className="text-slate-400 text-sm mt-1" style={PERSIAN_FONT}>
              امروز چی می‌خوای یاد بگیری؟
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-red-700 text-sm fade-in"
            dir="rtl"
            style={PERSIAN_FONT}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-2xl px-5 py-8 shadow-sm border border-slate-100 text-center fade-in">
            <div className="flex justify-center mb-3">
              <div className="w-7 h-7 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            </div>
            <p className="text-slate-400 text-sm" style={PERSIAN_FONT}>
              در حال پردازش...
            </p>
          </div>
        )}

        {/* Result — progressive reveal */}
        {result && !loading && (
          <div className="space-y-3">
            {/* Part 1: English translation — always shown */}
            <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 fade-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Translation
              </p>
              <p className="text-slate-800 text-base leading-relaxed">
                {result.english_translation}
              </p>
            </div>

            {/* Part 2: Book sentences */}
            {!revealed.books ? (
              <button
                onClick={() => reveal('books')}
                className="w-full bg-sky-50 hover:bg-sky-100 text-sky-700 font-medium rounded-2xl px-5 py-4 transition-colors flex items-center justify-between fade-in"
                style={PERSIAN_FONT}
              >
                <span className="text-lg">📖</span>
                <span>Similar sentences from the book</span>
              </button>
            ) : (
              <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-sky-100 fade-in">
                <p
                  className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-3"
                  style={PERSIAN_FONT}
                >
                  From the Book
                </p>
                <div className="space-y-3">
                  {result.book_sentences.map((s, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-sky-300 font-mono text-xs mt-1 select-none shrink-0">
                        {i + 1}.
                      </span>
                      <p className="text-slate-700 text-sm leading-relaxed italic">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Part 3: Grammar — only after books revealed */}
            {revealed.books &&
              (!revealed.grammar ? (
                <button
                  onClick={() => reveal('grammar')}
                  className="w-full bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium rounded-2xl px-5 py-4 transition-colors flex items-center justify-between fade-in"
                  style={PERSIAN_FONT}
                >
                  <span className="text-lg">✏️</span>
                  <span>Grammar points</span>
                </button>
              ) : (
                <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-violet-100 fade-in">
                  <p
                    className="text-xs font-semibold uppercase tracking-wider text-violet-400 mb-3"
                    style={PERSIAN_FONT}
                  >
                    Grammar Point
                  </p>
                  <div className="space-y-3">
                    {result.grammar_point
                      .split('\n')
                      .filter(line => line.trim().length > 0)
                      .reduce((pairs, line, i, arr) => {
                        if (i % 2 === 0) pairs.push([line, arr[i + 1] || ''])
                        return pairs
                      }, [])
                      .map((pair, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-6">
                          <p className="text-slate-800 text-sm leading-relaxed sm:w-1/2">{pair[0]}</p>
                          <p className="text-slate-500 text-sm leading-relaxed sm:w-1/2" dir="rtl" style={PERSIAN_FONT}>{pair[1]}</p>
                        </div>
                      ))
                    }
                  </div>
                </div>
              ))}

            {/* Part 4: Practice — only after grammar revealed */}
            {revealed.grammar &&
              (!revealed.practice ? (
                <button
                  onClick={() => reveal('practice')}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-2xl px-5 py-4 transition-colors flex items-center justify-between fade-in"
                  style={PERSIAN_FONT}
                >
                  <span className="text-lg">📝</span>
                  <span>Practice</span>
                </button>
              ) : (
                <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-emerald-100 fade-in">
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-3">
                    Practice
                  </p>
                  <div className="space-y-6">
                    {result.practice_exercises.map((ex, i) => {
                      const parts = ex.split(' | ')
                      const prompt = parts[0] || ex
                      const fb = feedback[i]

                      return (
                        <div key={i} className="space-y-2">
                          {/* Question + input */}
                          <div className="flex gap-3 items-start">
                            <span className="text-emerald-400 font-mono text-xs mt-3 select-none shrink-0">{i + 1}.</span>
                            <div className="flex-1">
                              <p className="text-slate-700 text-sm leading-relaxed mb-1">{prompt}</p>
                              <input
                                type="text"
                                value={practiceAnswers[i] || ''}
                                onChange={(e) => setPracticeAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                                placeholder="Your answer..."
                                disabled={!!fb}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50 disabled:text-slate-400"
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
                                    <div className="bg-violet-50 rounded-xl px-4 py-3 space-y-2">
                                      <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-2">Simpler explanation</p>
                                      {fb.retryData.simpler_explanation
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
                                          onClick={() => {
                                            const correct = (fb.retryData.new_practice.split(' | ')[1] || '').trim().toLowerCase()
                                            const userAns = fb.retryAnswer.trim().toLowerCase()
                                            setFeedback(prev => ({
                                              ...prev,
                                              [i]: { ...prev[i], retryChecked: true, retryFeedback: userAns === correct ? 'correct' : 'wrong' },
                                            }))
                                          }}
                                          className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-xl transition-colors"
                                        >
                                          Check
                                        </button>
                                      ) : (
                                        <p className={`text-sm font-medium ${fb.retryFeedback === 'correct' ? 'text-emerald-600' : 'text-red-500'}`}>
                                          {fb.retryFeedback === 'correct'
                                            ? '✓ Well done!'
                                            : `✗ Correct: ${(fb.retryData.new_practice.split(' | ')[1] || '').trim()}`}
                                        </p>
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
              ))}
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
  const [loadingInteractions, setLoadingInteractions] = useState(false)

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
    setLoadingInteractions(true)
    fetch(`/api/student/${selectedId}/interactions`)
      .then((r) => r.json())
      .then(setInteractions)
      .finally(() => setLoadingInteractions(false))
  }, [selectedId, isAuthed])

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const thisWeekCount = interactions.filter(
    (i) => new Date(i.created_at) >= oneWeekAgo
  ).length

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-sm">
          <h1 className="text-xl font-bold text-slate-800 mb-1">Teacher Dashboard</h1>
          <p className="text-slate-400 text-sm mb-6" style={PERSIAN_FONT}>
            داشبورد معلم
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="رمز عبور"
              autoFocus
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-right"
              style={PERSIAN_FONT}
            />
            {authError && (
              <p className="text-red-500 text-sm text-right" style={PERSIAN_FONT}>
                رمز عبور اشتباه است
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium py-2.5 rounded-xl transition-colors"
              style={PERSIAN_FONT}
            >
              ورود
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold text-slate-800">Romira — Teacher Dashboard</h1>
          <p className="text-slate-400 text-xs" style={PERSIAN_FONT}>
            داشبورد معلم
          </p>
        </div>
        <Link to="/" className="text-sm text-teal-600 hover:text-teal-800 transition-colors">
          ← Student view
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Summary card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-500">Student</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.level}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-2xl font-bold text-teal-600">{thisWeekCount}</p>
              <p className="text-xs text-slate-400">this week</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-600">{interactions.length}</p>
              <p className="text-xs text-slate-400">total</p>
            </div>
          </div>
        </div>

        {/* Interactions list */}
        {loadingInteractions ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading...</div>
        ) : interactions.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm" style={PERSIAN_FONT}>
            هنوز تمرینی ثبت نشده
          </div>
        ) : (
          <div className="space-y-3">
            {interactions.map((ix) => (
              <div key={ix.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <p className="text-xs text-slate-400 mb-3">
                  {new Date(ix.created_at).toLocaleString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
                <div className="space-y-2">
                  <div dir="rtl" className="bg-amber-50 rounded-xl px-4 py-3">
                    <p className="text-xs text-amber-500 mb-1" style={PERSIAN_FONT}>
                      ورودی فارسی
                    </p>
                    <p className="text-slate-800 text-sm" style={PERSIAN_FONT}>
                      {ix.persian_input}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-xl px-4 py-3">
                    <p className="text-xs text-slate-400 mb-1">English translation</p>
                    <p className="text-slate-700 text-sm">{ix.english_translation}</p>
                  </div>
                  <div className="bg-violet-50 rounded-xl px-4 py-3">
                    <p className="text-xs text-violet-400 mb-1">Grammar point</p>
                    <p className="text-slate-700 text-sm whitespace-pre-wrap">{ix.grammar_point}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StudentView />} />
        <Route path="/teacher" element={<TeacherView />} />
      </Routes>
    </BrowserRouter>
  )
}
