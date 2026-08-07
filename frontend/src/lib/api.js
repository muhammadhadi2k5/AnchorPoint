// falls back to whatever host the page itself was loaded from (same
// hostname, backend's port) instead of a hardcoded 'localhost' - that way
// it also works when the page is opened from another device on the LAN via
// this machine's IP, where 'localhost' would otherwise mean the phone itself
const BASE_URL = import.meta.env.VITE_API_BASE || `http://${window.location.hostname}:8000`

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
  if (!response.ok) {
    // 503s come from two different backend causes (couldn't reach Gemini at
    // all vs. Gemini itself reporting overloaded) - the detail field is what
    // tells them apart, so it has to be read here rather than assumed
    let detail = response.status === 503 ? 'connection_error' : 'unknown'
    try {
      detail = (await response.json()).detail || detail
    } catch {
      // body wasn't JSON, fall back to the status-based default above
    }
    throw new ApiError(detail, `Request failed with status ${response.status}`)
  }
  return response
}

function request(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, options).then(handleErrors)
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

export async function updateDataset(datasetId, updates) {
  const response = await request(`/datasets/${datasetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  return response.json()
}

export async function deleteDataset(datasetId) {
  const response = await request(`/datasets/${datasetId}`, { method: 'DELETE' })
  return response.json()
}

export async function getIngestStatus(datasetId) {
  const response = await request(`/datasets/${datasetId}/ingest-status`)
  return response.json()
}

// re-runs ingestion on the files already in the dataset, no new uploads
export async function reingestDataset(datasetId) {
  const response = await request(`/datasets/${datasetId}/reingest`, { method: 'POST' })
  return response.json()
}

export async function getDatasetStats(datasetId) {
  const response = await request(`/datasets/${datasetId}/stats`)
  return response.json()
}

export async function listMessages(datasetId) {
  const response = await request(`/datasets/${datasetId}/messages`)
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

// --- Live tab (automatic per-message evaluation) ---

export async function listEvaluations(datasetId, { limit = 50, offset = 0 } = {}) {
  const response = await request(`/datasets/${datasetId}/evaluations?limit=${limit}&offset=${offset}`)
  return response.json()
}

export async function getEvaluationsSummary(datasetId) {
  const response = await request(`/datasets/${datasetId}/evaluations/summary`)
  return response.json()
}

// not called anywhere in the app yet, kept for a plausible future feature
// like a shareable single-evaluation link
export async function getEvaluation(datasetId, evaluationId) {
  const response = await request(`/datasets/${datasetId}/evaluations/${evaluationId}`)
  return response.json()
}

// --- Test Set tab (on-demand golden-answer evaluation) ---

export async function createGoldenQuestion(datasetId, { question, expectedAnswer, expectedSources }) {
  const response = await request(`/datasets/${datasetId}/golden-questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question,
      expected_answer: expectedAnswer,
      expected_sources: expectedSources,
    }),
  })
  return response.json()
}

export async function listGoldenQuestions(datasetId) {
  const response = await request(`/datasets/${datasetId}/golden-questions`)
  return response.json()
}

export async function deleteGoldenQuestion(datasetId, questionId) {
  const response = await request(`/datasets/${datasetId}/golden-questions/${questionId}`, {
    method: 'DELETE',
  })
  return response.json()
}

export async function startGoldenRun(datasetId) {
  const response = await request(`/datasets/${datasetId}/golden-runs`, { method: 'POST' })
  return response.json()
}

export async function listGoldenRuns(datasetId) {
  const response = await request(`/datasets/${datasetId}/golden-runs`)
  return response.json()
}

export async function getGoldenRun(datasetId, runId) {
  const response = await request(`/datasets/${datasetId}/golden-runs/${runId}`)
  return response.json()
}

export async function deleteGoldenRun(datasetId, runId) {
  const response = await request(`/datasets/${datasetId}/golden-runs/${runId}`, { method: 'DELETE' })
  return response.json()
}

export async function clearGoldenRuns(datasetId) {
  const response = await request(`/datasets/${datasetId}/golden-runs/clear`, { method: 'DELETE' })
  return response.json()
}
