import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { listMessages, sendMessageStream } from '../lib/api.js'
import CitationDrawer, { formatChunkText } from '../components/CitationDrawer.jsx'
import DatasetStats from '../components/DatasetStats.jsx'
import DocumentLibrary from '../components/DocumentLibrary.jsx'
import 'katex/dist/katex.min.css'
import './ChatView.css'

const GREETINGS = [
  'What are we looking into today?',
  'Ask anything about these documents',
  "What's on your mind?",
  'Ready when you are',
]

// copies the raw markdown source, same text the message is stored/rendered
// from, not a plain-text-stripped version
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API can be unavailable (non-https context, permissions) - fail silently
    }
  }

  return (
    <button
      type="button"
      className={`copy-button${copied ? ' copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy response'}
      title={copied ? 'Copied' : 'Copy response'}
    >
      {copied ? (
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" className="copy-icon" aria-hidden="true">
          <rect x="2" y="4.5" width="8" height="9.5" rx="1.75" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M5.5 4.5V3.75C5.5 2.784 6.284 2 7.25 2H12.25C13.216 2 14 2.784 14 3.75V9.75C14 10.716 13.216 11.5 12.25 11.5H11.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}

const PREVIEW_LENGTH = 160

function citationPreview(citation) {
  if (!citation.text) return "Chunk text isn't available for this older message."
  const cleaned = formatChunkText(citation.text)
  return cleaned.length > PREVIEW_LENGTH ? `${cleaned.slice(0, PREVIEW_LENGTH).trimEnd()}...` : cleaned
}

function buildExportMarkdown(datasetName, messages) {
  const lines = [`# ${datasetName} — Chat Export`, '', `_Exported ${new Date().toLocaleString()}_`]

  for (const message of messages) {
    lines.push('', message.role === 'user' ? `**You:** ${message.content}` : `**Assistant:** ${message.content}`)
    if (message.citations?.length > 0) {
      const sources = message.citations.map((c, i) => `${i + 1}. ${c.source_file}`).join(', ')
      lines.push('', `*Sources: ${sources}*`)
    }
  }

  return lines.join('\n')
}

function downloadExport(datasetName, messages) {
  const blob = new Blob([buildExportMarkdown(datasetName, messages)], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${datasetName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-chat-${new Date().toISOString().slice(0, 10)}.md`
  link.click()
  URL.revokeObjectURL(url)
}

export default function ChatView({ datasetId, datasetName, onQuotaExceeded, onAddDocuments, onReingest, onOpenEvaluations }) {
  const [messages, setMessages] = useState([])
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const [greeting, setGreeting] = useState('')
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState(null)
  const [sending, setSending] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [activeCitation, setActiveCitation] = useState(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // grows the textarea as you type, up to a max height, then it scrolls. recalculated on
  // every keystroke since pasting or deleting a line both need the height rechecked too
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [input])

  useEffect(() => {
    setMessagesLoaded(false)
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)])
    listMessages(datasetId).then((msgs) => {
      setMessages(msgs)
      setMessagesLoaded(true)
    })
  }, [datasetId])

  // only counts as empty once we're sure, not just "hasn't loaded yet", otherwise a dataset
  // with real history would flash centered before snapping down once it loads
  const isEmpty = messagesLoaded && messages.length === 0 && streamingText === null

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, streamingText])

  const handleSend = async () => {
    const query = input.trim()
    if (!query || sending) return

    setInput('')
    setSending(true)
    setConnectionError(null)
    setMessages((current) => [...current, { id: 'pending-user', role: 'user', content: query, citations: null }])
    setStreamingText('')

    try {
      let text = ''
      for await (const chunk of sendMessageStream(datasetId, query)) {
        text += chunk
        setStreamingText(text)
      }
      const fresh = await listMessages(datasetId)
      setMessages(fresh)
    } catch (err) {
      if (err.type === 'quota_exceeded') {
        onQuotaExceeded()
      } else if (err.type === 'ai_service_unavailable') {
        setConnectionError("Gemini is overloaded on Google's end right now, not your connection. Try again in a bit.")
      } else {
        setConnectionError("Looks like the connection dropped. Try sending that again once you're back online.")
      }
      const fresh = await listMessages(datasetId)
      setMessages(fresh)
    } finally {
      setStreamingText(null)
      setSending(false)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-ambient-wash" aria-hidden="true" />

      <div className="chat-header">
        <button type="button" className="chat-library-toggle" onClick={() => setShowLibrary(true)}>
          Documents
        </button>
        <button type="button" className="chat-library-toggle" onClick={onOpenEvaluations}>
          Evaluations
        </button>
        <button type="button" className="chat-library-toggle" onClick={() => setShowStats(true)}>
          Stats
        </button>
        <button
          type="button"
          className="chat-library-toggle"
          onClick={() => downloadExport(datasetName, messages)}
          disabled={messages.length === 0}
        >
          Export
        </button>
      </div>

      <div className="chat-scroll-area">
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div
              key={message.id ?? index}
              className={`message-group ${message.role}${message.id === 'pending-user' ? ' sending' : ''}`}
            >
              <div className={`bubble ${message.role}`}>
                {message.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  message.content
                )}
                {message.citations && message.citations.length > 0 && (
                  <div className="citation-row">
                    <span className="citation-label">Sources</span>
                    {message.citations.map((citation, i) => (
                      <span className="citation-tag-wrap" key={i}>
                        <button
                          type="button"
                          className="citation-tag"
                          onClick={() => setActiveCitation({ ...citation, answerText: message.content })}
                        >
                          {i + 1}
                        </button>
                        <span className="citation-hover-preview" role="tooltip">
                          <span className="citation-hover-source">{citation.source_file}</span>
                          <span className="citation-hover-text">{citationPreview(citation)}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {message.role === 'assistant' && (
                <div className="message-actions">
                  <CopyButton text={message.content} />
                </div>
              )}
            </div>
          ))}

          {streamingText !== null && (
            <div className="message-group assistant">
              {streamingText === '' ? (
                <div className="bubble assistant loading-bubble">
                  <span className="thinking-glow-bar" aria-label="Thinking">
                    <span className="thinking-glow-beam" />
                  </span>
                </div>
              ) : (
                <div className="bubble assistant">
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{streamingText}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}

          {connectionError && <div className="inline-error">{connectionError}</div>}

          <div ref={bottomRef} className="chat-bottom-spacer" />
        </div>
      </div>

      <div className={`chat-bottom${isEmpty ? ' chat-bottom-centered' : ''}`}>
        {isEmpty && <p className="chat-greeting">{greeting}</p>}

        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Ask anything about these documents..."
            value={input}
            rows={1}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button className="chat-send" onClick={handleSend} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>

        <p className="chat-footer">Your anchor point for accurate, sourced answers.</p>
      </div>

      <CitationDrawer citation={activeCitation} onClose={() => setActiveCitation(null)} />

      {showLibrary && (
        <DocumentLibrary
          datasetId={datasetId}
          onClose={() => setShowLibrary(false)}
          onAddDocuments={(files) => {
            setShowLibrary(false)
            onAddDocuments(files)
          }}
          onReingest={() => {
            setShowLibrary(false)
            onReingest()
          }}
        />
      )}

      {showStats && <DatasetStats datasetId={datasetId} onClose={() => setShowStats(false)} />}
    </div>
  )
}
