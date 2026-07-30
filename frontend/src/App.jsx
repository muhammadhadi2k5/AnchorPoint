import { useState } from 'react'
import HomeView from './views/HomeView.jsx'
import IngestionLoadingView from './views/IngestionLoadingView.jsx'
import ChatView from './views/ChatView.jsx'
import QuotaModal from './components/QuotaModal.jsx'
import { createDataset } from './api.js'

export default function App() {
  const [view, setView] = useState('home')
  const [datasetId, setDatasetId] = useState(null)
  const [quotaExceeded, setQuotaExceeded] = useState(false)

  const handleStart = async (name, files) => {
    const dataset = await createDataset(name, files)
    setDatasetId(dataset.id)
    setView('loading')
  }

  const handleIngestComplete = () => {
    setView('chat')
  }

  return (
    <>
      {view === 'loading' && (
        <IngestionLoadingView datasetId={datasetId} onComplete={handleIngestComplete} />
      )}
      {view === 'chat' && (
        <ChatView datasetId={datasetId} onQuotaExceeded={() => setQuotaExceeded(true)} />
      )}
      {view === 'home' && <HomeView onStart={handleStart} />}
      {quotaExceeded && <QuotaModal onClose={() => setQuotaExceeded(false)} />}
    </>
  )
}
