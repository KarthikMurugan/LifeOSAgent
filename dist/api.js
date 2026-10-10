// Same-origin by default. Set window.DAYGLOW_API_BASE for a separate backend.
const base = () => window.DAYGLOW_API_BASE || '';
async function request(path, options={}, timeout=30000) {
  const response = await fetch(base()+path, {...options, headers:{'Content-Type':'application/json', ...options.headers}, signal:AbortSignal.timeout(timeout)});
  if (!response.ok) {
    const error=new Error(response.status===502?'Your copilot is temporarily unavailable. Please try again in a moment.':'We couldn’t complete your request. Please try again.');error.status=response.status;throw error;
  }
  return response.json();
}
export const dayglowAPI = {
  context: source => request('/api/'+source),
  plan: input => request('/api/agent/plan', {method:'POST', body:JSON.stringify(input)}, 300000),
  chat: input => request('/api/chat', {method:'POST', body:JSON.stringify(input)}, 300000),
  saved: thread => request('/api/plan/'+thread)
};
