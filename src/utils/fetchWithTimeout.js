export async function fetchWithTimeout(url, opts = {}, timeoutMs = 60_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...opts, signal: controller.signal })
    return response
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Délai dépassé (${Math.round(timeoutMs / 1000)} s) — le serveur d'analyse n'a pas répondu.`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
