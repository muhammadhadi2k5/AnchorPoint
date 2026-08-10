import './ParseView.css'

export default function ParseView({ onBack }) {
  return (
    <div className="parse-view">
      <div className="parse-hero-band" aria-hidden="true" />

      <button type="button" className="parse-view-back" onClick={onBack}>&lsaquo; Back</button>
      <h1 className="parse-view-heading">Parse your documents</h1>
      <p className="parse-view-placeholder">Nothing here yet.</p>
    </div>
  )
}
