import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { listMessages, sendMessageStream } from '../api.js'
import CitationDrawer from '../components/CitationDrawer.jsx'
import DocumentLibrary from '../components/DocumentLibrary.jsx'
import copyIcon from '../../elements/copy-logo.png'
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
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <img src={copyIcon} alt="" className="copy-icon" />
      )}
    </button>
  )
}

export default function ChatView({ datasetId, onQuotaExceeded, onAddDocuments, onReingest, onOpenEvaluations }) {
  const [messages, setMessages] = useState([])
  const [messagesLoaded, setMessagesLoaded] = useState(false)
  const [greeting, setGreeting] = useState('')
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState(null)
  const [sending, setSending] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [activeCitation, setActiveCitation] = useState(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    setMessagesLoaded(false)
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)])
    listMessages(datasetId).then((msgs) => {
      setMessages(msgs)
      setMessagesLoaded(true)
    })
  }, [datasetId])

  // known-empty (not just "hasn't loaded yet") is what puts the input bar in
  // its centered starting position, so a dataset that already has history
  // doesn't flash centered before snapping to the bottom once it loads
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
      </div>

      <div className="chat-scroll-area">
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={message.id ?? index} className={`message-group ${message.role}`}>
              <div className={`bubble ${message.role}`}>
                {message.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  message.content
                )}
                {message.citations && message.citations.length > 0 && (
                  <div className="citation-row">
                    <span className="citation-label">Sources</span>
                    {message.citations.map((citation, i) => (
                      <button
                        type="button"
                        key={i}
                        className="citation-tag"
                        onClick={() => setActiveCitation(citation)}
                      >
                        {i + 1}
                      </button>
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
                  <span className="thinking-spinner" aria-label="Thinking" />
                </div>
              ) : (
                <div className="bubble assistant">
                  <div className="markdown-body">
                    <ReactMarkdown>{streamingText}</ReactMarkdown>
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
          <input
            className="chat-input"
            placeholder="Ask anything about these documents..."
            value={input}
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
    </div>
  )
}
