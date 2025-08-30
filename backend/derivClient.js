client bound to a user session
const WebSocket = require('ws');

class DerivClient {
  constructor({ appId, token }) {
    this.appId = 80342;
    this.token = token; // Deriv API token scoped for read/trade as you prefer
    this.ws = null;
    this.ready = false;
    this.pending = [];
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    const url = `wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`;
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      // authorize as soon as connected
      this.send({ authorize: this.token });
    });

    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.msg_type === 'authorize') {
        this.ready = true;
        // flush pending
        this.pending.forEach((p) => this.send(p));
        this.pending = [];
      }
    });

    this.ws.on('close', () => {
      this.ready = false;
    });

    this.ws.on('error', (err) => {
      console.error('Deriv WS error', err);
    });
  }

  send(payload) {
    const data = JSON.stringify(payload);
    if (!this.ws || this.ws.readyState !== 1 || !this.ready) {
      this.pending.push(payload);
      return;
    }
    this.ws.send(data);
  }

  subscribe(payload, onData) {
    this.connect();
    const id = Math.random().toString(36).slice(2);

    const handle = (raw) => {
      try {
        const msg = JSON.parse(raw);
        // basic filter by msg_type if present
        if (payload.ticks && msg.msg_type === 'tick') onData(msg);
        if (payload.subscribe && msg.subscription) onData(msg);
      } catch {}
    };

    this.ws.on('message', handle);
    this.send(payload);

    const unsubscribe = () => {
      try {
        // Deriv unsubscribe uses subscription id from stream messages
        // Caller should pass the correct subscription id to an /unsubscribe endpoint when needed
      } catch {}
      this.ws.off('message', handle);
    };

    return { id, unsubscribe };
  }

  call(payload) {
    return new Promise((resolve, reject) => {
      this.connect();
      const correlation = Math.random().toString(36).slice(2);
      const listener = (raw) => {
        const msg = JSON.parse(raw);
        if (msg.echo_req && msg.echo_req._cid === correlation) {
          this.ws.off('message', listener);
          if (msg.error) return reject(msg.error);
          resolve(msg);
        }
      };
      this.ws.on('message', listener);
      this.send({ ...payload, _cid: correlation });
    });
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}
