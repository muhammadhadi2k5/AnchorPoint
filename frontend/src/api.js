const BASE_URL = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(type, message) {
    super(message)
    this.type = type
  }
}

async function handleErrors(response) {
  if (response.status === 429) {
    throw new ApiError('quota_exceeded', 'Daily quota exceeded')
  }
  if (response.status === 503) {
    throw new ApiError('connection_error', 'Connection dropped')
  }
  if (!response.ok) {
    throw new ApiError('unknown', `Request failed with status ${response.status}`)
  }
  return response
}

function request(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, { credentials: 'include', ...options }).then(handleErrors)
}

export async function createDataset(name, files) {
  const form = new FormData()
  form.append('name', name)
  for (const file of files) form.append('files', file)
  const response = await request('/datasets', { method: 'POST', body: form })
  return response.json()
}

export async function listDatasets() {
  const response = await request('/datasets')
  return response.json()
}

export async function getDataset(datasetId) {
  const response = await request(`/datasets/${datasetId}`)
  return response.json()
}

export async function listFiles(datasetId) {
  const response = await request(`/datasets/${datasetId}/files`)
  return response.json()
}

export async function addDocuments(datasetId, files) {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  const response = await request(`/datasets/${datasetId}/documents`, { method: 'POST', body: form })
  return response.json()
}

export async function getIngestStatus(datasetId) {
  const response = await request(`/datasets/${datasetId}/ingest-status`)
  return response.json()
}

export async function listMessages(datasetId) {
  const response = await request(`/datasets/${datasetId}/messages`)
  return response.json()
}

export async function clearConversation(datasetId) {
  const response = await request(`/datasets/${datasetId}/messages`, { method: 'DELETE' })
  return response.json()
}

// streams the answer back piece by piece as it arrives, instead of waiting
// for the whole response - mirrors how the backend already streams from Gemini
export async function* sendMessageStream(datasetId, content) {
  const response = await request(`/datasets/${datasetId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    yield decoder.decode(value, { stream: true })
  }
}
