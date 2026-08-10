import { useEffect, useState } from 'react'
import HomeView from './views/HomeView.jsx'
import IngestionLoadingView from './views/IngestionLoadingView.jsx'
import ChatView from './views/ChatView.jsx'
import LandingView from './views/LandingView.jsx'
import ParseView from './views/ParseView.jsx'
import Sidebar from './components/Sidebar.jsx'
import QuotaModal from './components/QuotaModal.jsx'
import EvaluationDashboard from './components/EvaluationDashboard.jsx'
import {
  addDocuments,
  createDataset,
  deleteDataset,
  getIngestStatus,
  listDatasets,
  reingestDataset,
  updateDataset,
} from './lib/api.js'
import './styles/App.css'

const SIDEBAR_COLLAPSE_KEY = 'anchorpoint-sidebar-collapsed'
const THEME_KEY = 'anchorpoint-theme'

export default function App() {
  // 'landing' -> 'app' - no login gate, everyone shares the same datasets
  const [stage, setStage] = useState('landing')
  const [view, setView] = useState('home')
  const [datasetId, setDatasetId] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [quotaExceeded, setQuotaExceeded] = useState(false)
  const [showEvaluations, setShowEvaluations] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  // index.html already set the theme on <html> before react even mounted, just reading it
  // back here so react's state matches what's already on screen
  const [theme, setTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  })

  const refreshDatasets = () => listDatasets().then(setDatasets)

  // pushes a history entry on the way in, so both the browser's back button and our own
  // back button go through this same handler instead of two paths that could get out of sync
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state?.stage === 'app') {
        setStage('app')
      } else {
        setStage('landing')
        setView('home')
        setDatasetId(null)
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const handleEnterApp = () => {
    window.history.pushState({ stage: 'app' }, '')
    setStage('app')
    refreshDatasets()
  }

  const handleBackToLanding = () => {
    window.history.back()
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

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch {
        // same as sidebar collapse above - still works for the session
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

  const handleOpenParse = () => setView('parse')

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
    return <LandingView onStart={handleEnterApp} theme={theme} onToggleTheme={toggleTheme} />
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
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="app-main">
        {view === 'loading' && (
          <IngestionLoadingView datasetId={datasetId} onComplete={handleIngestComplete} />
        )}
        {view === 'chat' && (
          <ChatView
            datasetId={datasetId}
            datasetName={datasets.find((d) => d.id === datasetId)?.name ?? 'Dataset'}
            onQuotaExceeded={() => setQuotaExceeded(true)}
            onAddDocuments={handleAddDocuments}
            onReingest={handleReingest}
            onOpenEvaluations={() => setShowEvaluations(true)}
          />
        )}
        {view === 'home' && (
          <HomeView
            onStart={handleStart}
            onBack={handleBackToLanding}
            showBrandWord={sidebarCollapsed}
            onOpenParse={handleOpenParse}
          />
        )}
        {view === 'parse' && <ParseView onBack={() => setView('home')} />}
      </main>

      {quotaExceeded && <QuotaModal onClose={() => setQuotaExceeded(false)} />}
      {showEvaluations && datasetId && (
        <EvaluationDashboard datasetId={datasetId} onClose={() => setShowEvaluations(false)} />
      )}
    </div>
  )
}
