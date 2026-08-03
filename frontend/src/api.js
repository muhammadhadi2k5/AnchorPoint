

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
  if (response.status === 503) {
    throw new ApiError('connection_error', 'Connection dropped')
  }
  if (!response.ok) {
    let detail = 'unknown'
    try {
      detail = (await response.json()).detail || detail
    } catch {
      // body wasn't JSON, fall back to the generic type below
    }
    throw new ApiError(detail, `Request failed with status ${response.status}`)
  }
  return response
}

function request(path, options = {}) {
  return fetch(`${BASE_URL}${path}`, { credentials: 'include', ...options }).then(handleErrors)
}

export async function signup(email, password) {
  const response = await request('/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return response.json()
}

export async function login(email, password) {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return response.json()
}

export async function logout() {
  const response = await request('/auth/logout', { method: 'POST' })
  return response.json()
}

// returns null instead of throwing on a 401, since "no one is logged in
// yet" is an expected state on first load, not an error
export async function getCurrentUser() {
  try {
    const response = await request('/auth/me')
    return response.json()
  } catch (err) {
    if (err instanceof ApiError && err.type === 'not_authenticated') return null
    throw err
  }
}

export async function verifyEmail(code) {
  const response = await request('/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  return response.json()
}

export async function resendVerification() {
  const response = await request('/auth/resend-verification', { method: 'POST' })
  return response.json()
}

export async function forgotPassword(email) {
  const response = await request('/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return response.json()
}

export async function resetPassword(email, code, newPassword) {
  const response = await request('/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, new_password: newPassword }),
  })
  return response.json()
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
