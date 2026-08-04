import { useEffect, useRef, useState } from 'react'
import logoIcon from '../../elements/anchorpoint-icon.png'
import './Sidebar.css'

export default function Sidebar({
  datasets,
  activeDatasetId,
  onSelectDataset,
  onNewDataset,
  onRenameDataset,
  onPinDataset,
  onDeleteDataset,
  onOpenEvaluations,
  collapsed,
  onToggleCollapsed,
}) {
  const [menu, setMenu] = useState(null) // { id, x, y, confirmDelete }
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef(null)

  useEffect(() => {
    if (!menu) return undefined
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus()
  }, [renamingId])

  const openMenu = (event, dataset) => {
    event.preventDefault()
    event.stopPropagation()
    setMenu({ id: dataset.id, x: event.clientX, y: event.clientY, confirmDelete: false })
  }

  const menuDataset = menu ? datasets.find((d) => d.id === menu.id) : null

  const startRename = (dataset) => {
    setRenamingId(dataset.id)
    setRenameValue(dataset.name)
    setMenu(null)
  }

  const commitRename = (id) => {
    const trimmed = renameValue.trim()
    setRenamingId(null)
    if (trimmed) onRenameDataset(id, trimmed)
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        type="button"
        className="sidebar-brand"
        onClick={onToggleCollapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <img src={logoIcon} className="sidebar-brand-icon" alt="" />
        <span className="sidebar-brand-word">
          ANCHOR<span className="accent">POINT</span>
        </span>
      </button>

      <button type="button" className="sidebar-new" onClick={onNewDataset} title="New dataset">
        <span className="sidebar-new-icon">+</span>
        <span className="sidebar-new-label">New dataset</span>
      </button>

      <button
        type="button"
        className="sidebar-eval"
        onClick={onOpenEvaluations}
        disabled={!activeDatasetId}
        title={activeDatasetId ? 'Evaluations' : 'Open a dataset to see its evaluations'}
      >
        <span className="sidebar-eval-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="sidebar-eval-label">Evaluations</span>
      </button>

      {datasets.length === 0 ? (
        <p className="sidebar-empty">Nothing here yet. Your datasets will show up once you start one.</p>
      ) : (
        <ul className="sidebar-list">
          {datasets.map((dataset) => (
            <li key={dataset.id} onContextMenu={(e) => openMenu(e, dataset)}>
              {renamingId === dataset.id ? (
                <input
                  ref={renameInputRef}
                  className="sidebar-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(dataset.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(dataset.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`sidebar-item${dataset.id === activeDatasetId ? ' active' : ''}`}
                  onClick={() => onSelectDataset(dataset.id)}
                >
                  {dataset.pinned ? <span className="pin-dot" aria-hidden="true" /> : null}
                  <span className="sidebar-item-name">{dataset.name}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {menu && menuDataset && (
        <div className="context-menu" style={{ top: menu.y, left: menu.x }} onClick={(e) => e.stopPropagation()}>
          {menu.confirmDelete ? (
            <>
              <p className="context-menu-confirm-text">Delete this dataset? This can't be undone.</p>
              <button type="button" className="context-menu-danger" onClick={() => { onDeleteDataset(menu.id); setMenu(null) }}>
                Delete
              </button>
              <button type="button" onClick={() => setMenu(null)}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { onPinDataset(menu.id, !menuDataset.pinned); setMenu(null) }}>
                {menuDataset.pinned ? 'Unpin' : 'Pin to top'}
              </button>
              <button type="button" onClick={() => startRename(menuDataset)}>Rename</button>
              <button
                type="button"
                className="context-menu-danger"
                onClick={() => setMenu((current) => ({ ...current, confirmDelete: true }))}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
