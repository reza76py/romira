import { useState, useRef, useEffect } from 'react'
import { PERSIAN_FONT } from './App.jsx'

const LESSON_TYPES = [
  { id: 'daily', label: 'Daily Conversation', emoji: '☕', desc: 'Talk about everyday topics' },
  { id: 'roleplay', label: 'Role-play', emoji: '🎭', desc: 'Practice real-life scenarios' },
  { id: 'read_talk', label: 'Read & Talk', emoji: '📖', desc: 'Coming soon', disabled: true },
]

// Browser capability flags — computed once
const speechInputSupported =
  typeof window !== 'undefined' &&
  !!(window.SpeechRecognition || window.webkitSpeechRecognition)

const speechOutputSupported =
  typeof window !== 'undefined' && !!window.speechSynthesis

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({ studentId, onStart }) {
  const [lessonType, setLessonType] = useState('daily')
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleStart() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/conversation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, lesson_type: lessonType, topic: topic.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Error ${res.status}`)
      }
      const data = await res.json()
      onStart(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-10 bg-amber-50">
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-bold text-slate-800 mb-1">Start a Conversation</h2>
        <p className="text-slate-400 text-sm mb-8">Choose what you'd like to practice today</p>

        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Lesson Type</p>
        <div className="space-y-2 mb-7">
          {LESSON_TYPES.map(lt => (
            <button
              key={lt.id}
              disabled={lt.disabled}
              onClick={() => !lt.disabled && setLessonType(lt.id)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl border-2 text-left transition-all
                ${lt.disabled ? 'opacity-40 cursor-not-allowed border-slate-100 bg-white' :
                  lessonType === lt.id
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-slate-200 bg-white hover:border-teal-300'}`}
            >
              <span className="text-2xl">{lt.emoji}</span>
              <div>
                <p className={`font-semibold text-sm ${lessonType === lt.id && !lt.disabled ? 'text-teal-700' : 'text-slate-700'}`}>{lt.label}</p>
                <p className="text-xs text-slate-400">{lt.desc}</p>
              </div>
              {lessonType === lt.id && !lt.disabled && (
                <span className="ml-auto w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs">✓</span>
              )}
            </button>
          ))}
        </div>

        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Topic <span className="font-normal text-slate-400 normal-case">(optional)</span></p>
        <input
          type="text"
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleStart()}
          placeholder="e.g. weekend plans, cooking, travel…"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 mb-6"
        />

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white font-semibold py-3 rounded-2xl transition-colors text-base"
        >
          {loading ? 'Starting…' : 'Start Conversation ✦'}
        </button>
      </div>
    </div>
  )
}

// ─── Correction Card ──────────────────────────────────────────────────────────

function CorrectionCard({ correction }) {
  return (
    <div className="mt-2 rounded-xl px-4 py-3 text-sm" style={{ background: '#fefce8', border: '1.5px solid #fde68a' }}>
      <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1.5">✏️ Small correction</p>
      <p className="text-green-700 font-semibold mb-1">{correction.corrected}</p>
      <p className="text-slate-500 text-xs mb-1">{correction.note}</p>
      <p className="text-xs text-indigo-600" dir="rtl" style={PERSIAN_FONT}>{correction.note_fa}</p>
    </div>
  )
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────

function ChatScreen({ studentId, session, onFinish }) {
  const [messages, setMessages] = useState([
    { role: 'ai', content: session.opening, correction: null }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [turnCount, setTurnCount] = useState(0)
  const [shouldWrap, setShouldWrap] = useState(false)
  const [error, setError] = useState(null)
  const [listening, setListening] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [speakingIdx, setSpeakingIdx] = useState(null)

  const bottomRef = useRef(null)
  const recognitionRef = useRef(null)
  const autoSpeakRef = useRef(true)
  const lastSpokenIdxRef = useRef(-1)

  // Keep autoSpeakRef in sync; cancel speech when turned off
  useEffect(() => {
    autoSpeakRef.current = autoSpeak
    if (!autoSpeak) {
      window.speechSynthesis?.cancel()
      setSpeakingIdx(null)
    }
  }, [autoSpeak])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-speak new AI messages
  useEffect(() => {
    if (!speechOutputSupported || !autoSpeakRef.current) return
    const lastIdx = messages.length - 1
    const lastMsg = messages[lastIdx]
    if (lastMsg?.role === 'ai' && lastIdx > lastSpokenIdxRef.current) {
      lastSpokenIdxRef.current = lastIdx
      speakText(lastMsg.content, lastIdx)
    }
  }, [messages]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function speakText(text, msgIdx) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    setSpeakingIdx(null)
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-US'
    utt.rate = 0.95
    utt.onstart = () => setSpeakingIdx(msgIdx)
    utt.onend = () => setSpeakingIdx(null)
    utt.onerror = () => setSpeakingIdx(null)
    window.speechSynthesis.speak(utt)
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInput(transcript)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    // Stop recognition if running
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
    }
    // Cancel any current speech
    window.speechSynthesis?.cancel()
    setSpeakingIdx(null)

    setInput('')
    setError(null)
    setMessages(prev => [...prev, { role: 'student', content: text, correction: null }])
    setLoading(true)
    try {
      const res = await fetch('/api/conversation/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.session_id, message: text }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Error ${res.status}`)
      }
      const data = await res.json()
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], correction: data.correction }
        return [...next, { role: 'ai', content: data.reply, correction: null }]
      })
      setTurnCount(data.turn_count)
      setShouldWrap(data.should_wrap)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-amber-50">
      <style>{`
        @keyframes speakPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(13,148,136,0); }
          50%       { box-shadow: 0 0 0 6px rgba(13,148,136,0.25); }
        }
        .sara-speaking {
          animation: speakPulse 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <header className="bg-teal-700 text-white px-4 py-3 flex justify-between items-center shrink-0">
        <div>
          <p className="font-semibold text-sm leading-tight">
            {session.lesson_type === 'daily' ? '☕ Daily Conversation' : '🎭 Role-play'}
          </p>
          {session.topic && <p className="text-teal-200 text-xs">{session.topic}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-teal-300">turn {turnCount}</span>
          {speechOutputSupported && (
            <button
              onClick={() => setAutoSpeak(v => !v)}
              title={autoSpeak ? 'Auto-speak on — tap to mute' : 'Auto-speak off — tap to unmute'}
              className={`text-base px-2 py-1 rounded-lg transition-colors ${
                autoSpeak
                  ? 'bg-teal-600 text-white border border-teal-400'
                  : 'text-teal-400 border border-teal-600'
              }`}
            >
              {autoSpeak ? '🔊' : '🔇'}
            </button>
          )}
          <button
            onClick={onFinish}
            className="text-xs text-teal-200 hover:text-white border border-teal-500 hover:border-teal-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            Finish session
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] ${msg.role === 'student' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'ai'
                    ? `bg-white text-slate-800 rounded-tl-sm border border-slate-100 shadow-sm${speakingIdx === i ? ' sara-speaking' : ''}`
                    : 'bg-teal-600 text-white rounded-tr-sm'
                }`}
              >
                {msg.content}
              </div>
              {msg.correction && <CorrectionCard correction={msg.correction} />}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-100 shadow-sm px-4 py-3 rounded-2xl rounded-tl-sm">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Wrap prompt */}
      {shouldWrap && (
        <div className="px-4 pb-2">
          <button
            onClick={onFinish}
            className="w-full text-sm text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-xl py-2.5 transition-colors"
          >
            Ready to finish? See your session summary →
          </button>
        </div>
      )}

      {error && <p className="text-red-500 text-xs text-center px-4 pb-1">{error}</p>}

      {/* Input */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 pt-3 pb-4">
        {listening && (
          <p className="text-xs text-rose-500 mb-1.5 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Listening… speak now
          </p>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
            }}
            placeholder={listening ? 'Listening…' : 'Type your message…'}
            rows={2}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:bg-slate-50"
          />
          {speechInputSupported && (
            <button
              onClick={toggleListening}
              disabled={loading}
              title={listening ? 'Stop recording' : 'Speak'}
              className={`p-2.5 rounded-xl transition-colors shrink-0 text-lg ${
                listening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40'
              }`}
            >
              🎤
            </button>
          )}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-teal-200 text-white font-medium px-4 py-2.5 rounded-xl transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Summary Screen ───────────────────────────────────────────────────────────

function SummaryScreen({ sessionId, onNewConversation, onExit }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/api/conversation/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail || 'Failed')))
      .then(data => { setReport(data); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full bg-amber-50">
      <p className="text-slate-400 animate-pulse">Generating your session summary…</p>
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full bg-amber-50 px-6 gap-4">
      <p className="text-red-500 text-sm">{error}</p>
      <button onClick={onExit} className="text-teal-600 underline text-sm">Go back</button>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-amber-50">
      <header className="bg-teal-700 text-white px-4 py-3 shrink-0">
        <h2 className="font-bold">Session Summary</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {/* Summary */}
        <div className="bg-white rounded-2xl px-5 py-4 border border-slate-100 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">How it went</p>
          <p className="text-slate-800 text-sm leading-relaxed mb-3">{report.summary}</p>
          <p className="text-sm leading-relaxed text-indigo-700" dir="rtl" style={PERSIAN_FONT}>{report.summary_fa}</p>
        </div>

        {/* Strengths */}
        {report.strengths?.length > 0 && (
          <div className="bg-green-50 rounded-2xl px-5 py-4 border border-green-100">
            <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-2">✦ Strengths</p>
            <ul className="space-y-1">
              {report.strengths.map((s, i) => (
                <li key={i} className="text-sm text-green-800 flex gap-2"><span>•</span>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Focus areas */}
        {report.focus_areas?.length > 0 && (
          <div className="bg-amber-50 rounded-2xl px-5 py-4 border border-amber-200">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2">🎯 Focus areas</p>
            <ul className="space-y-1">
              {report.focus_areas.map((f, i) => (
                <li key={i} className="text-sm text-amber-800 flex gap-2"><span>•</span>{f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* New words */}
        {report.new_words?.length > 0 && (
          <div className="bg-white rounded-2xl px-5 py-4 border border-slate-100 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">📚 New words from this session</p>
            <div className="space-y-2">
              {report.new_words.map((w, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
                  <span className="text-sm font-semibold text-slate-800">{w.word}</span>
                  <span className="text-sm text-indigo-600" style={PERSIAN_FONT}>{w.translation}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-4 py-4 flex gap-3">
        <button
          onClick={onNewConversation}
          className="flex-1 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 rounded-2xl transition-colors text-sm"
        >
          New conversation
        </button>
        <button
          onClick={onExit}
          className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold py-3 rounded-2xl transition-colors text-sm"
        >
          Back
        </button>
      </div>
    </div>
  )
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function ConversationView({ studentId, onExit }) {
  const [screen, setScreen] = useState('setup')   // 'setup' | 'chat' | 'summary'
  const [session, setSession] = useState(null)

  function handleStart(data) {
    setSession(data)
    setScreen('chat')
  }

  function handleFinish() {
    setScreen('summary')
  }

  function handleNewConversation() {
    setSession(null)
    setScreen('setup')
  }

  if (screen === 'setup') return (
    <div className="flex flex-col bg-amber-50" style={{ height: '100dvh' }}>
      <header className="bg-teal-700 text-white px-4 py-3 flex justify-between items-center shrink-0">
        <h1 className="text-base font-bold">Conversation Practice</h1>
        <button
          onClick={onExit}
          className="text-xs text-teal-200 hover:text-white border border-teal-500 hover:border-teal-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <SetupScreen studentId={studentId} onStart={handleStart} />
      </div>
    </div>
  )

  if (screen === 'chat') return (
    <div style={{ height: '100dvh' }}>
      <ChatScreen
        studentId={studentId}
        session={session}
        onFinish={handleFinish}
      />
    </div>
  )

  return (
    <div style={{ height: '100dvh' }}>
      <SummaryScreen
        sessionId={session.session_id}
        onNewConversation={handleNewConversation}
        onExit={onExit}
      />
    </div>
  )
}
