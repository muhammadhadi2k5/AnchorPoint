import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { listMessages, sendMessageStream } from '../api.js'
import CitationDrawer from '../components/CitationDrawer.jsx'
import DocumentLibrary from '../components/DocumentLibrary.jsx'
import './ChatView.css'

export default function ChatView({ datasetId, onQuotaExceeded, onAddDocuments }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streamingText, setStreamingText] = useState(null)
  const [sending, setSending] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [activeCitation, setActiveCitation] = useState(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    listMessages(datasetId).then(setMessages)
  }, [datasetId])

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
      </div>

      <div className="chat-scroll-area">
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={message.id ?? index} className={`bubble ${message.role}`}>
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
          ))}

          {streamingText !== null && (
            streamingText === '' ? (
              <div className="bubble assistant loading-bubble">
                <span className="thinking-spinner" aria-label="Thinking" />
              </div>
            ) : (
              <div className="bubble assistant">
                <div className="markdown-body">
                  <ReactMarkdown>{streamingText}</ReactMarkdown>
                </div>
              </div>
            )
          )}

          {connectionError && <div className="inline-error">{connectionError}</div>}

          <div ref={bottomRef} />
        </div>
      </div>

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

      <CitationDrawer citation={activeCitation} onClose={() => setActiveCitation(null)} />

      {showLibrary && (
        <DocumentLibrary
          datasetId={datasetId}
          onClose={() => setShowLibrary(false)}
          onAddDocuments={(files) => {
            setShowLibrary(false)
            onAddDocuments(files)
          }}
        />
      )}
    </div>
  )
}
