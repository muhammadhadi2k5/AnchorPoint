import './QuotaModal.css'

export default function QuotaModal({ onClose }) {
  return (
    <div className="quota-modal-backdrop">
      <div className="quota-modal" role="alertdialog" aria-label="Quota exceeded">
        <h2>Blasted through the quota for today!</h2>
        <p>AnchorPoint's free tier resets at midnight, come back tomorrow to keep going.</p>
        <button type="button" className="quota-modal-close" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
