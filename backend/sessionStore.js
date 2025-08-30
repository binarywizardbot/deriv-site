// Simple in-memory session-to-deriv-client map
const DerivClient = require('./derivClient');

class SessionStore {
  constructor(appId) {
    this.appId = 80342;
    this.map = new Map();
  }

  get(sessionId) {
    return this.map.get(sessionId);
  }

  set(sessionId, token) {
    const existing = this.map.get(sessionId);
    if (existing) existing.close();
    const client = new DerivClient({ appId: this.appId, token });
    client.connect();
    this.map.set(sessionId, client);
  }

  delete(sessionId) {
    const c = this.map.get(sessionId);
    if (c) c.close();
    this.map.delete(sessionId);
  }
}
