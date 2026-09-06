export function notifySessionDataChanged(resource?: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('therapy-sessions-changed', { detail: resource }));
}
