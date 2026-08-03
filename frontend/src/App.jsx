import { useState } from 'react'
import HomeView from './views/HomeView.jsx'
import IngestionLoadingView from './views/IngestionLoadingView.jsx'
import ChatView from './views/ChatView.jsx'
import LandingView from './views/LandingView.jsx'
import Sidebar from './components/Sidebar.jsx'
import QuotaModal from './components/QuotaModal.jsx'
import {
  addDocuments,
  createDataset,
  deleteDataset,
  getIngestStatus,
  listDatasets,
  reingestDataset,
  updateDataset,
} from './api.js'
import './App.css'

const SIDEBAR_COLLAPSE_KEY = 'anchorpoint-sidebar-collapsed'

export default function App() {
  // 'landing' -> 'app' - no login gate, everyone shares the same datasets
  const [stage, setStage] = useState('landing')
  const [view, setView] = useState('home')
  const [datasetId, setDatasetId] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })

  const refreshDatasets = () => listDatasets().then(setDatasets)

  const handleEnterApp = () => {
    setStage('app')
    refreshDatasets()
  }

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // localStorage can be unavailable (private browsing, etc.) - collapse
        // still works for the session, it just won't be remembered
      }
      return next
    })
  }

  const handleStart = async (name, files) => {
    const dataset = await createDataset(name, files)
    setDatasetId(dataset.id)
    setView('loading')
    refreshDatasets()
  }

  const handleIngestComplete = () => {
    setView('chat')
  }

  // ingestion runs in the background, so a dataset that's still ingesting
  // needs to land back on the loading screen instead of jumping to chat
  const handleSelectDataset = async (id) => {
    setDatasetId(id)
    try {
      const status = await getIngestStatus(id)
      setView(status.done ? 'chat' : 'loading')
    } catch {
      setView('chat')
    }
  }

  const handleNewDataset = () => {
    setDatasetId(null)
    setView('home')
  }

  const handleRenameDataset = async (id, name) => {
    await updateDataset(id, { name })
    refreshDatasets()
  }

  const handlePinDataset = async (id, pinned) => {
    await updateDataset(id, { pinned })
    refreshDatasets()
  }

  const handleDeleteDataset = async (id) => {
    await deleteDataset(id)
    if (id === datasetId) {
      setDatasetId(null)
      setView('home')
    }
    refreshDatasets()
  }

  // reuses the same full ingestion loading screen as the initial upload,
  // per the locked design decision to keep both flows consistent
  const handleAddDocuments = async (files) => {
    await addDocuments(datasetId, files)
    setView('loading')
  }

  // same loading screen, just re-running ingestion on files already saved
  // for this dataset instead of uploading new ones
  const handleReingest = async () => {
    await reingestDataset(datasetId)
    setView('loading')
  }

  if (stage === 'landing') {
    return <LandingView onStart={handleEnterApp} />
  }

  return (
    <div className="app-shell">
      <Sidebar
        datasets={datasets}
        activeDatasetId={datasetId}
        onSelectDataset={handleSelectDataset}
        onNewDataset={handleNewDataset}
        onRenameDataset={handleRenameDataset}
        onPinDataset={handlePinDataset}
        onDeleteDataset={handleDeleteDataset}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <main className="app-main">
        {view === 'loading' && (
          <IngestionLoadingView datasetId={datasetId} onComplete={handleIngestComplete} />
        )}
        {view === 'chat' && (
          <ChatView
            datasetId={datasetId}
            onQuotaExceeded={() => setQuotaExceeded(true)}
            onAddDocuments={handleAddDocuments}
            onReingest={handleReingest}
          />
        )}
        {view === 'home' && (
          <HomeView onStart={handleStart} showBrandWord={sidebarCollapsed} />
        )}
      </main>

      {quotaExceeded && <QuotaModal onClose={() => setQuotaExceeded(false)} />}
    </div>
  )
}
