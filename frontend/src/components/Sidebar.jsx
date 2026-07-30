import './Sidebar.css'

export default function Sidebar({ datasets, activeDatasetId, onSelectDataset, onNewDataset }) {
  return (
    <aside className="sidebar">
      <button type="button" className="sidebar-new" onClick={onNewDataset}>
        + New dataset
      </button>

      {datasets.length === 0 ? (
        <p className="sidebar-empty">Nothing here yet. Your datasets will show up once you start one.</p>
      ) : (
        <ul className="sidebar-list">
          {datasets.map((dataset) => (
            <li key={dataset.id}>
              <button
                type="button"
                className={`sidebar-item${dataset.id === activeDatasetId ? ' active' : ''}`}
                onClick={() => onSelectDataset(dataset.id)}
              >
                {dataset.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
