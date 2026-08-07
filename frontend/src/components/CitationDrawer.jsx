import './CitationDrawer.css'

// some PDFs (certificates especially) come out with a space between every letter and only a
// double space at real word breaks, this splits on those double spaces first then glues the broken single-letter runs back together
export function formatChunkText(text) {
  return text
    .split(/ {2,}|\n+/)
    .map((part) => {
      const tokens = part.split(' ')
      const isCharSpaced = tokens.length > 1 && tokens.every((t) => t.length <= 1)
      return isCharSpaced ? tokens.join('') : part
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'in', 'on', 'at', 'to',
  'for', 'and', 'or', 'but', 'with', 'as', 'by', 'from', 'that', 'this', 'these', 'those', 'it', 'its',
  'if', 'then', 'than', 'so', 'not', 'no', 'do', 'does', 'did', 'has', 'have', 'had', 'can', 'could',
  'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'also', 'which', 'who', 'whom', 'whose',
  'what', 'when', 'where', 'why', 'how', 'there', 'here', 'their', 'they', 'them', 'he', 'she', 'his',
  'her', 'we', 'our', 'you', 'your', 'i', 'my', 'source',
])

function significantWords(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

// splits the chunk into sentences and flags the ones that share enough words with the answer
// to have plausibly come from there, rough guesswork but good enough to point you nearby
function highlightUsedSentences(chunkText, answerText) {
  const answerWords = new Set(significantWords(answerText.replace(/\[Source \d+\]/g, '')))
  if (answerWords.size === 0) return null

  const sentences = chunkText.split(/(?<=[.!?])\s+/).filter(Boolean)
  return sentences.map((sentence) => {
    const words = significantWords(sentence)
    const overlap = words.filter((w) => answerWords.has(w)).length
    return { text: sentence, used: words.length >= 3 && overlap / words.length >= 0.5 }
  })
}

export default function CitationDrawer({ citation, onClose }) {
  if (!citation) return null

  const chunkText = citation.text ? formatChunkText(citation.text) : null
  const highlights = chunkText && citation.answerText ? highlightUsedSentences(chunkText, citation.answerText) : null

  return (
    <>
      <div className="citation-backdrop" onClick={onClose} />
      <aside className="citation-drawer" role="dialog" aria-label="Source">
        <div className="citation-drawer-header">
          <span>Source</span>
          <button type="button" className="citation-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="citation-drawer-meta">
          <span className="citation-drawer-meta-label">Chunk metadata</span>
          <div className="citation-drawer-meta-body">
            <div>File: {citation.source_file}</div>
            {citation.page !== null && citation.page !== undefined && (
              <div>Page: {citation.page + 1}</div>
            )}
            <div>Match: {Math.round(citation.score * 100)}%</div>
          </div>
        </div>

        <div className="citation-drawer-chunk">
          <span className="citation-drawer-chunk-label">Chunk content</span>
          <p className="citation-drawer-chunk-text">
            {highlights
              ? highlights.map((segment, i) => (
                  <span key={i}>
                    {segment.used ? <mark className="citation-used">{segment.text}</mark> : segment.text}
                    {i < highlights.length - 1 ? ' ' : ''}
                  </span>
                ))
              : chunkText ?? "Chunk text isn't available for this older message."}
          </p>
        </div>
      </aside>
    </>
  )
}
