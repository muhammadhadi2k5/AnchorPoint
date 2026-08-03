import { useEffect, useState } from 'react'
import HomeView from './views/HomeView.jsx'
import IngestionLoadingView from './views/IngestionLoadingView.jsx'
import ChatView from './views/ChatView.jsx'
import LandingView from './views/LandingView.jsx'
import AuthView from './views/AuthView.jsx'
import VerifyEmailView from './views/VerifyEmailView.jsx'
import Sidebar from './components/Sidebar.jsx'
import QuotaModal from './components/QuotaModal.jsx'
import {
  addDocuments,
  createDataset,
  deleteDataset,
  getCurrentUser,
  getIngestStatus,
  listDatasets,
  logout,
  reingestDataset,
  updateDataset,
} from './api.js'
import './App.css'

const SIDEBAR_COLLAPSE_KEY = 'anchorpoint-sidebar-collapsed'

export default function App() {
  // 'checking' (session lookup in flight) -> 'landing' | 'auth' -> 'app'
  const [stage, setStage] = useState('checking')
  const [user, setUser] = useState(null)
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

  useEffect(() => {
    getCurrentUser().then((existingUser) => {
      if (!existingUser) {
        setStage('landing')
        return
      }
      setUser(existingUser)
      if (existingUser.email_verified) {
        setStage('app')
        refreshDatasets()
      } else {
        setStage('verify-email')
      }
    })
    // refreshDatasets is stable for the life of the component (defined
    // once, no dependencies of its own) - fine to omit from deps here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // signup/login land here - only fully into the app once the email is
  // verified, otherwise off to the code-entry screen first
  const handleAuthenticated = (authedUser) => {
    setUser(authedUser)
    if (authedUser.email_verified) {
      setStage('app')
      refreshDatasets()
    } else {
      setStage('verify-email')
    }
  }

  const handleVerified = (verifiedUser) => {
    setUser(verifiedUser)
    setStage('app')
    refreshDatasets()
  }

  const handleLogout = async () => {
    await logout()
    setUser(null)
    setDatasets([])
    setDatasetId(null)
    setView('home')
    setStage('landing')
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

  const refreshDatasets = () => listDatasets().then(setDatasets)

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

  if (stage === 'checking') {
    return <div className="app-shell app-shell-blank" />
  }

  if (stage === 'landing') {
    return <LandingView onSignIn={() => setStage('auth')} />
  }

  if (stage === 'auth') {
    return <AuthView onAuthenticated={handleAuthenticated} onBack={() => setStage('landing')} />
  }

  if (stage === 'verify-email') {
    return <VerifyEmailView email={user?.email} onVerified={handleVerified} />
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
        userEmail={user?.email}
        onLogout={handleLogout}
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
          <HomeView onStart={handleStart} showBrandWord={sidebarCollapsed} userEmail={user?.email} />
        )}
      </main>

      {quotaExceeded && <QuotaModal onClose={() => setQuotaExceeded(false)} />}
    </div>
  )
}
