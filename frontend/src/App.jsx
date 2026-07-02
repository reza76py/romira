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
  const [answers, setAnswers] = useState({})
  const [feedback, setFeedback] = useState({})
  const [explanations, setExplanations] = useState({})
  const [retryDataMap, setRetryDataMap] = useState({})
  const [retryTarget, setRetryTarget] = useState(null)
  const [retryExercise, setRetryExercise] = useState(null)
  const [retryAnswer, setRetryAnswer] = useState('')
  const [retryFeedback, setRetryFeedback] = useState(null)
  const [allCorrect, setAllCorrect] = useState(false)
  const [bookTranslations, setBookTranslations] = useState({})
  const [hints, setHints] = useState({})
  const [wordPopup, setWordPopup] = useState(null)
  const [wordMeaning, setWordMeaning] = useState(null)
  const [wordSaved, setWordSaved] = useState(false)
  const [showVocab, setShowVocab] = useState(false)
  const [vocabList, setVocabList] = useState({})
  const [expandedBox, setExpandedBox] = useState(null)
  const [flippedCards, setFlippedCards] = useState({})
  const [reviewedCards, setReviewedCards] = useState({})
  const [checkingAnswers, setCheckingAnswers] = useState(false)
  const [sessionId, setSessionId] = useState(null)
  const [sessionStart, setSessionStart] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  const [grammarLineIndex, setGrammarLineIndex] = useState(0)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    logEvent('login')
    fetch(`/api/student/${student.id}/progress`)
      .then(r => r.json())
      .then(p => setProgress(p))
  }, [])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Enter' && result && grammarLineIndex < result.grammar_point.split('\n').filter(l => l.trim()).length) {
        e.preventDefault()
        setGrammarLineIndex(prev => prev + 1)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [result, grammarLineIndex])

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
      await closeSession(false)
      setResult(data)
      setSessionId(data.id)
      setSessionStart(Date.now())
      setRetryCount(0)
      setGrammarLineIndex(0)
      setAnswers({})
      setFeedback({})
      setExplanations({})
      setRetryDataMap({})
      setRetryTarget(null)
      setRetryExercise(null)
      setRetryAnswer('')
      setRetryFeedback(null)
      setAllCorrect(false)
      setBookTranslations({})
      setHints({})
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

  function speak(text) {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'en-GB'
    utter.rate = 0.85
    window.speechSynthesis.speak(utter)
  }

  function handleWordClick(word, e) {
    const clean = word.replace(/[.,!?;:'"()]/g, '').trim()
    if (!clean) return
    setWordPopup({word: clean})
    setWordMeaning(null)
    setWordSaved(false)
    fetch('/api/student/vocabulary/meaning', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({word: clean})
    }).then(r => r.json()).then(d => setWordMeaning(d.translation))
  }

  function handleSaveWord() {
    fetch('/api/student/vocabulary/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({student_id: student.id, word: wordPopup.word, translation: wordMeaning})
    }).then(r => r.json()).then(() => {
      setWordSaved(true)
      loadVocab()
    })
  }

  function loadVocab() {
    fetch(`/api/student/${student.id}/vocabulary`)
      .then(r => r.json())
      .then(d => setVocabList(d))
  }

  async function handleCheckAnswers() {
    setCheckingAnswers(true)
    logEvent('submit_answer', { answers, interaction_id: sessionId })
    const exs = result.practice_exercises.map(ex => {
      const [sentence, answer] = ex.split(' | ')
      return { sentence: sentence.trim(), answer: (answer || '').trim() }
    })
    const newFeedback = {}
    const newExplanations = {}
    const newRetryDataMap = {}

    for (let i = 0; i < exs.length; i++) {
      const correct = exs[i].answer.toLowerCase()
      const user = (answers[i] || '').trim().toLowerCase()
      if (user === correct) {
        newFeedback[i] = true
      } else {
        try {
          const res = await fetch('/api/student/retry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: student.id,
              wrong_answer: answers[i] || '',
              correct_answer: exs[i].answer,
              grammar_point: result.grammar_point,
            }),
          })
          const data = await res.json()
          setRetryCount(prev => prev + 1)
          logEvent('retry', { wrong_answer: answers[i], interaction_id: sessionId })
          newFeedback[i] = false
          newExplanations[i] = data.simpler_explanation
          const [rSent, rAns] = (data.new_practice || '').split(' | ')
          newRetryDataMap[i] = { sentence: (rSent || '').trim(), answer: (rAns || '').trim() }
        } catch {
          newFeedback[i] = false
        }
      }
    }

    setFeedback(newFeedback)
    setExplanations(newExplanations)
    setRetryDataMap(newRetryDataMap)
    const allC = exs.length > 0 && Object.values(newFeedback).every(f => f === true)
    setAllCorrect(allC)
    if (allC) closeSession(true)
    setCheckingAnswers(false)
  }

  async function closeSession(allCorrect) {
    if (!sessionId || !sessionStart) return
    const duration = Math.round((Date.now() - sessionStart) / 1000)
    try {
      await fetch(`/api/student/interaction/${sessionId}/close`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_seconds: duration,
          total_retries: retryCount,
          fully_correct: allCorrect
        })
      })
    } catch { /* silent fail */ }
    setSessionId(null)
    setSessionStart(null)
  }

  async function logEvent(eventType, metadata = null) {
    try {
      await fetch('/api/student/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: student.id,
          event_type: eventType,
          interaction_id: sessionId,
          metadata: metadata ? JSON.stringify(metadata) : null
        })
      })
    } catch { /* silent fail */ }
  }

  if (showVocab) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">📚 My Words</h2>
          <button onClick={() => setShowVocab(false)} className="text-sm text-slate-500 hover:text-slate-700 font-medium">← Back</button>
        </div>
        <div className="max-w-lg mx-auto p-5 space-y-4">
          {[1,2,3,4,5].map(boxNum => {
            const boxData = vocabList[`box_${boxNum}`]
            if (!boxData || boxData.total === 0) return null
            const boxColors = {
              1: {bg: '#fef2f2', border: '#fca5a5', title: '#dc2626', badge: '#fee2e2'},
              2: {bg: '#fff7ed', border: '#fdba74', title: '#ea580c', badge: '#ffedd5'},
              3: {bg: '#fefce8', border: '#fde047', title: '#ca8a04', badge: '#fef9c3'},
              4: {bg: '#f0fdf4', border: '#86efac', title: '#16a34a', badge: '#dcfce7'},
              5: {bg: '#eff6ff', border: '#93c5fd', title: '#2563eb', badge: '#dbeafe'},
            }
            const c = boxColors[boxNum]
            const intervals = {1:'daily',2:'every 2 days',3:'every 4 days',4:'every 7 days',5:'every 14 days'}
            const isExpanded = expandedBox === boxNum
            return (
              <div key={boxNum} className="rounded-2xl overflow-hidden" style={{border: `1.5px solid ${c.border}`, background: c.bg}}>
                <div className="px-5 py-4 flex items-center justify-between cursor-pointer" onClick={() => setExpandedBox(isExpanded ? null : boxNum)}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black" style={{color: c.title}}>Box {boxNum}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{background: c.badge, color: c.title}}>{intervals[boxNum]}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {boxData.due > 0 && <span className="text-xs font-bold px-2 py-1 rounded-full bg-white" style={{color: c.title}}>{boxData.due} due</span>}
                    <span className="text-xs text-slate-400">{boxData.total} words</span>
                    <span className="text-slate-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-5 pb-4 space-y-3">
                    {boxData.words.map(w => {
                      const isFlipped = flippedCards[w.id]
                      const isDone = reviewedCards[w.id]
                      return (
                        <div key={w.id} className={`rounded-xl border bg-white p-4 transition-all ${isDone ? 'opacity-50' : ''}`} style={{borderColor: c.border}}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-800">{w.word}</p>
                              {w.due && !isDone && <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{background: c.badge, color: c.title}}>due</span>}
                            </div>
                            <button onClick={() => setFlippedCards(f => ({...f, [w.id]: !f[w.id]}))} className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-2 py-1 rounded-lg">
                              {isFlipped ? 'hide' : 'show meaning'}
                            </button>
                          </div>
                          {isFlipped && (
                            <p className="mt-2 text-base font-semibold" style={{...PERSIAN_FONT, direction: 'rtl', color: c.title}}>{w.translation}</p>
                          )}
                          {isFlipped && !isDone && w.due && (
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={() => fetch(`/api/student/vocabulary/${w.id}/correct`, {method:'POST'}).then(() => { setReviewedCards(r => ({...r, [w.id]: 'correct'})); loadVocab() })}
                                className="flex-1 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold"
                              >✓ I knew it → Box {Math.min(w.box+1,5)}</button>
                              <button
                                onClick={() => fetch(`/api/student/vocabulary/${w.id}/forgot`, {method:'POST'}).then(() => { setReviewedCards(r => ({...r, [w.id]: 'forgot'})); loadVocab() })}
                                className="flex-1 py-2 rounded-xl bg-red-400 hover:bg-red-500 text-white text-xs font-bold"
                              >✗ Forgot → Box 1</button>
                            </div>
                          )}
                          {isDone && <p className="mt-2 text-xs font-semibold" style={{color: c.title}}>{reviewedCards[w.id] === 'correct' ? '✓ Moved up!' : '✗ Back to Box 1'}</p>}
                          <button onClick={() => fetch(`/api/student/vocabulary/${w.id}`, {method:'DELETE'}).then(() => loadVocab())} className="mt-2 text-xs text-red-300 hover:text-red-500">🗑 remove</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          {Object.values(vocabList).every(b => b.total === 0) && (
            <p className="text-slate-400 text-center py-10">No saved words yet. Click any word in the translation to save it.</p>
          )}
        </div>
      </div>
    )
  }

  const exercises = result
    ? result.practice_exercises.map(ex => {
        const [sentence, answer] = ex.split(' | ')
        return { sentence: sentence.trim(), answer: (answer || '').trim() }
      })
    : []

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
          <button onClick={() => { setShowVocab(true); loadVocab(); setExpandedBox(null); setFlippedCards({}); setReviewedCards({}) }} className="text-sm font-semibold text-white bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1.5 rounded-lg mr-2">
            📚 My Words
          </button>
          <button
            onClick={async () => { logEvent('exit', { interaction_id: sessionId }); await closeSession(false); onExit() }}
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

        {progress && !result && (
          <div className="rounded-2xl px-5 py-4 fade-in" style={{background: 'linear-gradient(135deg, #fef9c3, #fef3c7)', border: '1.5px solid #fcd34d'}}>
            <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">✦ Your Progress</p>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-700">{progress.total_sessions}</p>
                <p className="text-xs text-amber-600">Sessions</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-700">{progress.streak}🔥</p>
                <p className="text-xs text-amber-600">Day streak</p>
              </div>
              {progress.last_session && (
                <div className="text-center">
                  <p className="text-sm font-bold text-amber-700">{progress.last_session}</p>
                  <p className="text-xs text-amber-600">Last session</p>
                </div>
              )}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Translation */}
            <div className="bg-gradient-to-r from-emerald-50 to-sky-50 rounded-2xl border-l-4 border-teal-500 px-5 py-5 fade-in shadow-sm">
              <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-2">Translation</p>
              <div className="flex items-start gap-3">
                <p className="text-slate-800 text-lg font-medium leading-relaxed flex-1">
                  {result.english_translation.split(' ').map((word, i) => (
                    <span key={i} onClick={(e) => handleWordClick(word, e)} className="cursor-pointer hover:bg-yellow-100 hover:text-yellow-800 rounded px-0.5 transition-all">{word} </span>
                  ))}
                </p>
                <button onClick={() => speak(result.english_translation)} className="text-teal-500 hover:text-teal-700 text-xl mt-1" title="Listen">🔊</button>
              </div>
            </div>

            {/* Grammar */}
            {!revealed.grammar ? (
              <button
                onClick={() => { reveal('grammar'); logEvent('press_grammar', { interaction_id: sessionId }) }}
                className="w-full text-left bg-white hover:bg-purple-50 border border-purple-200 rounded-2xl px-5 py-3 text-sm text-purple-700 font-medium transition-colors"
              >
                Grammar points ✏️
              </button>
            ) : (
              <div className="bg-white rounded-2xl border-l-4 border-purple-400 px-5 py-4 fade-in shadow-sm">
                <p className="text-xs font-semibold text-purple-500 uppercase tracking-wider mb-3">Grammar Point</p>
                {result.sentence_parts && (
                  <div className="mb-4 p-3 bg-slate-50 rounded-xl text-sm font-medium leading-loose">
                    {result.english_translation.split(' ').map((word, i) => {
                      const clean = word.replace(/[.,!?;:'"]/g, '').toLowerCase()
                      const isSubject = result.sentence_parts.subject?.some(s => s.toLowerCase().includes(clean))
                      const isVerb = result.sentence_parts.verb?.some(v => v.toLowerCase().includes(clean))
                      const isObject = result.sentence_parts.object?.some(o => o.toLowerCase().includes(clean))
                      const color = isSubject ? 'text-blue-600 font-semibold' : isVerb ? 'text-red-500 font-semibold' : isObject ? 'text-green-600 font-semibold' : 'text-slate-700'
                      return <span key={i} className={color}>{word} </span>
                    })}
                    <div className="mt-2 flex gap-4 text-xs text-slate-500">
                      <span className="text-blue-600">■ Subject</span>
                      <span className="text-red-500">■ Verb</span>
                      <span className="text-green-600">■ Object</span>
                    </div>
                  </div>
                )}
                <div className="text-slate-700 text-sm leading-relaxed space-y-2">
                  {result.grammar_point.split('\n').filter(l => l.trim()).slice(0, grammarLineIndex).map((line, i) => (
                    <p key={i} style={line.match(/[؀-ۿ]/) ? {...PERSIAN_FONT, direction: 'rtl'} : {direction: 'ltr'}}>
                      {line}
                    </p>
                  ))}
                </div>
                {grammarLineIndex < result.grammar_point.split('\n').filter(l => l.trim()).length && (
                  <button
                    onClick={() => setGrammarLineIndex(prev => prev + 1)}
                    className="mt-3 text-xs text-purple-500 hover:text-purple-700 font-medium"
                  >
                    Press Enter or tap to reveal next ↓
                  </button>
                )}
              </div>
            )}

            {/* From the Book */}
            {!revealed.books ? (
              <button
                onClick={() => { reveal('books'); logEvent('press_book', { interaction_id: sessionId }) }}
                className="w-full text-left bg-white hover:bg-teal-50 border border-teal-200 rounded-2xl px-5 py-3 text-sm text-teal-700 font-medium transition-colors"
              >
                Similar sentences from the book 📖
              </button>
            ) : (
              <div className="bg-white rounded-2xl border-l-4 border-teal-400 px-5 py-4 space-y-2 fade-in shadow-sm">
                <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider mb-2">From the Book</p>
                {result.book_sentences.map((s, i) => (
                  <div key={i} className="border-l-4 border-teal-400 pl-4 py-1">
                    <div className="flex items-start gap-2">
                      <p className="text-slate-800 text-sm font-medium leading-relaxed flex-1">{s.text || s}</p>
                      <button onClick={() => speak(s.text || s)} className="text-teal-400 hover:text-teal-600 text-base mt-0.5" title="Listen">🔊</button>
                    </div>
                    {s.location && <p className="text-xs text-teal-500 mt-1 font-semibold">{s.location}</p>}
                    <button
                      onClick={() => {
                        if (bookTranslations[i]) {
                          setBookTranslations(t => {const n = {...t}; delete n[i]; return n})
                        } else {
                          setBookTranslations(t => ({...t, [`loading_${i}`]: true}))
                          fetch('/api/student/translate-sentence', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({sentence: s.text || s})
                          }).then(r => r.json()).then(data => setBookTranslations(t => ({...t, [i]: data.translation, [`loading_${i}`]: false})))
                        }
                      }}
                      className="mt-2 text-xs font-bold text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1 rounded-full border border-teal-200 transition-all"
                    >
                      {bookTranslations[`loading_${i}`] ? '...' : bookTranslations[i] ? '▲ بستن' : 'ترجمه ▼'}
                    </button>
                    {bookTranslations[i] && (
                      <p className="mt-2 text-sm text-teal-800 bg-teal-50 rounded-lg px-3 py-2" style={{...PERSIAN_FONT, direction: 'rtl'}}>
                        {bookTranslations[i]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Practice */}
            {!revealed.practice ? (
              <button
                onClick={() => { reveal('practice'); logEvent('press_practice', { interaction_id: sessionId }) }}
                className="w-full text-left bg-white hover:bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-sm text-amber-700 font-medium transition-colors"
              >
                Practice 📝
              </button>
            ) : (
              <div className="bg-white rounded-2xl border-l-4 border-amber-400 px-5 py-4 fade-in shadow-sm">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-3">Practice</p>
                <div className="space-y-5">
                  {exercises.map((ex, i) => {
                    const checked = feedback[i] !== undefined
                    const isCorrect = feedback[i] === true
                    return (
                      <div key={i} className="space-y-2">
                        <p className="text-slate-800 text-sm">{ex.sentence}</p>
                        <input
                          type="text"
                          value={answers[i] || ''}
                          onChange={(e) => setAnswers(a => ({ ...a, [i]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && Object.keys(feedback).length === 0) handleCheckAnswers()
                          }}
                          disabled={checked}
                          placeholder="Your answer..."
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50"
                        />
                        {feedback[i] === undefined && !hints[i] && (
                          <button
                            onClick={() => setHints(h => ({...h, [i]: ex.answer[0] + '...'}))}
                            className="mt-1 text-xs text-amber-500 hover:text-amber-700 font-medium"
                          >
                            💡 Hint
                          </button>
                        )}
                        {hints[i] && <p className="mt-1 text-xs text-amber-600 font-semibold">💡 Starts with: <span className="font-bold">{hints[i]}</span></p>}

                        {checked && (
                          <div className="ml-4 space-y-2">
                            {isCorrect ? (
                              <p className="text-emerald-600 text-sm font-medium">✓ Correct!</p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-red-500 text-sm font-medium">
                                  ✗ Correct answer: <span className="font-bold">{ex.answer}</span>
                                </p>
                                {explanations[i] && (
                                  <div className="bg-purple-50 rounded-xl px-4 py-3">
                                    <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">Explanation</p>
                                    <p className="text-slate-700 text-sm leading-relaxed" dir="rtl" style={PERSIAN_FONT}>
                                      {explanations[i]}
                                    </p>
                                  </div>
                                )}
                                {retryDataMap[i] && retryTarget !== i && (
                                  <button
                                    onClick={() => {
                                      setRetryTarget(i)
                                      setRetryExercise(retryDataMap[i])
                                      setRetryAnswer('')
                                      setRetryFeedback(null)
                                    }}
                                    className="text-sm bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium px-4 py-2 rounded-xl transition-colors"
                                  >
                                    Try again →
                                  </button>
                                )}
                                {retryTarget === i && retryExercise && (
                                  <div className="space-y-2 bg-emerald-50 rounded-xl px-4 py-3">
                                    <p className="text-slate-700 text-sm">{retryExercise.sentence}</p>
                                    <input
                                      type="text"
                                      value={retryAnswer}
                                      onChange={(e) => setRetryAnswer(e.target.value)}
                                      disabled={retryFeedback !== null}
                                      placeholder="Your answer..."
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                                    />
                                    {retryFeedback === null && (
                                      <button
                                        onClick={async () => {
                                          const correct = retryExercise.answer.toLowerCase()
                                          const user = retryAnswer.trim().toLowerCase()
                                          if (user === correct) {
                                            setRetryFeedback(true)
                                          } else {
                                            try {
                                              const res = await fetch('/api/student/retry', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                  student_id: student.id,
                                                  wrong_answer: retryAnswer,
                                                  correct_answer: retryExercise.answer,
                                                  grammar_point: result.grammar_point
                                                })
                                              })
                                              const data = await res.json()
                                              setRetryCount(prev => prev + 1)
                                              logEvent('retry', { wrong_answer: retryAnswer, interaction_id: sessionId })
                                              const [rSent, rAns] = (data.new_practice || '').split(' | ')
                                              setRetryExercise({ sentence: (rSent || '').trim(), answer: (rAns || '').trim() })
                                              setExplanations(prev => ({ ...prev, [i]: data.simpler_explanation }))
                                              setRetryAnswer('')
                                              setRetryFeedback(null)
                                            } catch {
                                              setRetryFeedback(false)
                                            }
                                          }
                                        }}
                                        className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-xl transition-colors"
                                      >
                                        Check
                                      </button>
                                    )}
                                    {retryFeedback === true && (
                                      <p className="text-sm font-medium text-emerald-600">✓ Well done!</p>
                                    )}
                                    {retryFeedback === false && (
                                      <p className="text-sm font-medium text-red-500">✗ Keep practicing!</p>
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
                    className="mt-5 w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
                  >
                    {checkingAnswers ? 'Checking...' : 'Check Answers'}
                  </button>
                )}

                {allCorrect && (
                  <p className="mt-4 text-center text-sm text-emerald-600 font-medium">
                    🎉 All correct! Great work!
                  </p>
                )}
              </div>
            )}
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

      {wordPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setWordPopup(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <p className="text-xl font-bold text-slate-800 mb-1">{wordPopup.word}</p>
            {wordMeaning ? (
              <>
                <p className="text-lg text-teal-700 font-semibold mb-4" style={{...PERSIAN_FONT, direction: 'rtl'}}>{wordMeaning}</p>
                {!wordSaved ? (
                  <button onClick={handleSaveWord} className="w-full py-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-bold text-sm">
                    💾 Save to My Words
                  </button>
                ) : (
                  <p className="text-center text-green-600 font-bold">✓ Saved!</p>
                )}
              </>
            ) : (
              <p className="text-slate-400 text-sm">Loading...</p>
            )}
            <button onClick={() => setWordPopup(null)} className="mt-3 w-full py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50">Close</button>
          </div>
        </div>
      )}
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
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentBook, setNewStudentBook] = useState('')
  const [studentAdded, setStudentAdded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showDb, setShowDb] = useState(false)
  const [dbData, setDbData] = useState(null)
  const [loadingDb, setLoadingDb] = useState(false)

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

  async function handleAddStudent(e) {
    e.preventDefault()
    if (!newStudentName.trim() || !newStudentBook.trim()) return
    const res = await fetch('/api/students/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newStudentName.trim(), book: newStudentBook.trim(), level: '' })
    })
    if (res.ok) {
      const newStudent = await res.json()
      const updated = await fetch('/api/students/').then(r => r.json())
      setStudents(updated)
      setSelectedId(String(newStudent.id))
      setNewStudentName('')
      setNewStudentBook('')
      setStudentAdded(true)
      setTimeout(() => setStudentAdded(false), 3000)
    }
  }

  async function handleDeleteStudent() {
    const res = await fetch(`/api/students/${selectedId}`, { method: 'DELETE' })
    if (res.ok) {
      const updated = await fetch('/api/students/').then(r => r.json())
      setStudents(updated)
      setSelectedId(String(updated[0]?.id || ''))
      setConfirmDelete(false)
    }
  }

  async function handleViewDb() {
    if (showDb) { setShowDb(false); return }
    setLoadingDb(true)
    try {
      const [studentsRes, interactionsRes, errorsRes, eventsRes] = await Promise.all([
        fetch('/api/students/').then(r => r.json()),
        fetch(`/api/student/${selectedId}/interactions`).then(r => r.json()),
        fetch(`/api/student/${selectedId}/errors`).then(r => r.json()),
        fetch(`/api/student/${selectedId}/events?limit=50`).then(r => r.json()),
      ])
      setDbData({ students: studentsRes, interactions: interactionsRes, errors: errorsRes, events: eventsRes })
      setShowDb(true)
    } finally {
      setLoadingDb(false)
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
        <div className="flex items-center gap-4">
          <button
            onClick={handleViewDb}
            disabled={loadingDb}
            className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            {loadingDb ? '...' : showDb ? 'Hide DB' : 'View DB'}
          </button>
          <Link to="/" className="text-sm text-teal-600 hover:text-teal-800 transition-colors">
            ← Student view
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {showDb && dbData && (
          <div className="bg-slate-900 rounded-2xl p-5 space-y-6 text-xs font-mono overflow-x-auto">
            <h2 className="text-slate-300 font-bold text-sm">Database Viewer</h2>

            {/* Students table */}
            <div>
              <p className="text-teal-400 font-bold mb-2">STUDENTS ({dbData.students.length} rows)</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pr-4 pb-1">id</th>
                    <th className="pr-4 pb-1">name</th>
                    <th className="pr-4 pb-1">level</th>
                    <th className="pr-4 pb-1">book</th>
                    <th className="pr-4 pb-1">password</th>
                    <th className="pr-4 pb-1">created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {dbData.students.map(s => (
                    <tr key={s.id} className="text-slate-300 border-t border-slate-800">
                      <td className="pr-4 py-1">{s.id}</td>
                      <td className="pr-4 py-1">{s.name}</td>
                      <td className="pr-4 py-1">{s.level || '—'}</td>
                      <td className="pr-4 py-1">{s.book}</td>
                      <td className="pr-4 py-1 text-amber-400">{s.password || '(not set)'}</td>
                      <td className="pr-4 py-1 text-slate-500">{new Date(s.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Interactions table */}
            <div>
              <p className="text-teal-400 font-bold mb-2">STUDENT_INTERACTIONS ({dbData.interactions.length} rows) — selected student</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pr-4 pb-1">id</th>
                    <th className="pr-4 pb-1">persian_input</th>
                    <th className="pr-4 pb-1">english</th>
                    <th className="pr-4 pb-1">duration_s</th>
                    <th className="pr-4 pb-1">retries</th>
                    <th className="pr-4 pb-1">fully_correct</th>
                    <th className="pr-4 pb-1">created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {dbData.interactions.map(ix => (
                    <tr key={ix.id} className="text-slate-300 border-t border-slate-800">
                      <td className="pr-4 py-1">{ix.id}</td>
                      <td className="pr-4 py-1 max-w-[120px] truncate" dir="rtl" style={PERSIAN_FONT}>{ix.persian_input}</td>
                      <td className="pr-4 py-1 max-w-[120px] truncate">{ix.english_translation}</td>
                      <td className="pr-4 py-1">{ix.duration_seconds ?? '—'}</td>
                      <td className="pr-4 py-1">{ix.total_retries ?? '—'}</td>
                      <td className={`pr-4 py-1 ${ix.fully_correct ? 'text-emerald-400' : ix.fully_correct === false ? 'text-red-400' : 'text-slate-500'}`}>
                        {ix.fully_correct === true ? 'yes' : ix.fully_correct === false ? 'no' : '—'}
                      </td>
                      <td className="pr-4 py-1 text-slate-500">{new Date(ix.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Errors table */}
            <div>
              <p className="text-teal-400 font-bold mb-2">STUDENT_ERRORS ({dbData.errors.length} rows) — selected student</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pr-4 pb-1">id</th>
                    <th className="pr-4 pb-1">wrong</th>
                    <th className="pr-4 pb-1">correct</th>
                    <th className="pr-4 pb-1">noted_at</th>
                  </tr>
                </thead>
                <tbody>
                  {dbData.errors.map(e => (
                    <tr key={e.id} className="text-slate-300 border-t border-slate-800">
                      <td className="pr-4 py-1">{e.id}</td>
                      <td className="pr-4 py-1 text-red-400">{e.wrong}</td>
                      <td className="pr-4 py-1 text-emerald-400">{e.correct}</td>
                      <td className="pr-4 py-1 text-slate-500">{new Date(e.noted_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Events table */}
            <div>
              <p className="text-teal-400 font-bold mb-2">STUDENT_EVENTS ({dbData.events.length} rows) — selected student, last 50</p>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500">
                    <th className="pr-4 pb-1">id</th>
                    <th className="pr-4 pb-1">event_type</th>
                    <th className="pr-4 pb-1">interaction_id</th>
                    <th className="pr-4 pb-1">metadata</th>
                    <th className="pr-4 pb-1">created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {dbData.events.map(ev => (
                    <tr key={ev.id} className="text-slate-300 border-t border-slate-800">
                      <td className="pr-4 py-1">{ev.id}</td>
                      <td className="pr-4 py-1 text-amber-400">{ev.event_type}</td>
                      <td className="pr-4 py-1">{ev.interaction_id ?? '—'}</td>
                      <td className="pr-4 py-1 text-slate-400 max-w-[200px] truncate">{ev.event_metadata || '—'}</td>
                      <td className="pr-4 py-1 text-slate-500">{new Date(ev.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Section 1: Student Info ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          {/* Add student form */}
          <form onSubmit={handleAddStudent} className="flex gap-2 items-center pb-3 border-b border-slate-100">
            <input
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="Student name"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400 w-36"
            />
            <input
              type="text"
              value={newStudentBook}
              onChange={(e) => setNewStudentBook(e.target.value)}
              placeholder="Book title"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
            <button
              type="submit"
              disabled={!newStudentName.trim() || !newStudentBook.trim()}
              className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Add Student
            </button>
            {studentAdded && <span className="text-emerald-600 text-sm">Student added ✓</span>}
          </form>

          {/* Selector + stats + delete */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-500">Student</label>
              <select
                value={selectedId}
                onChange={(e) => { setSelectedId(e.target.value); setConfirmDelete(false) }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                {students.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.name}</option>
                ))}
              </select>
              {students.length > 1 && !confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-sm text-red-400 hover:text-red-600 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-4 text-sm text-slate-500">
              <span>This week: <span className="font-semibold text-slate-700">{thisWeekCount}</span></span>
              <span>Total: <span className="font-semibold text-slate-700">{interactions.length}</span></span>
            </div>
          </div>

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <p className="text-sm text-red-700 flex-1">
                Delete <strong>{students.find(s => String(s.id) === selectedId)?.name}</strong> and all their data? This cannot be undone.
              </p>
              <button
                onClick={handleDeleteStudent}
                className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                Cancel
              </button>
            </div>
          )}

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
