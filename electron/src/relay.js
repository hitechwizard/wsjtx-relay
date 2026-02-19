const dgram = require('dgram');
const EventEmitter = require('events');
const { WsjtxUdpParser } = require('./WsjtxUdpParser');

const CLIENT_TIMEOUT = 60000; // milliseconds

class WSJTXRelay extends EventEmitter {
  constructor(listenPort = 2237, forwards = []) {
    super();
    this.listenAddress = '0.0.0.0';
    this.listenPort = listenPort;
    this.forwards = forwards; // Array of {host, port}
    this.socket = null;
    this.running = false;
    this.mapping = new Map(); // forward addr -> Map of client addr -> timestamp
    this.cleanupInterval = null;
  }

  start() {
    if (this.running) {
      return;
    }

    this.socket = dgram.createSocket('udp4');
    this.running = true;

    this.socket.on('error', (err) => {
      this.emit('error', `Socket error: ${err.message}`);
    });

    this.socket.on('message', (data, rinfo) => {
      this.handleMessage(data, rinfo);
    });

    this.socket.bind(this.listenPort, this.listenAddress, () => {
      this.emit('log', `Listening on ${this.listenAddress}:${this.listenPort}, forwarding to: ${this.forwards.map(f => `${f.host}:${f.port}`).join(', ')}`);
      this.emit('status', 'running');
    });

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5000);
  }

  stop() {
    if (!this.running) {
      return;
    }

    this.running = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.mapping.clear();
    this.emit('log', 'Relay stopped');
    this.emit('status', 'stopped');
  }

  updateSettings(listenPort, forwards) {
    // Only restart the relay if the listen/forwards change
    if (listenPort == this.listenPort && forwards == this.forwards) {
      return;
    }
    const wasRunning = this.running;
    if (wasRunning) {
      this.stop();
    }

    this.listenPort = listenPort;
    this.forwards = forwards;

    if (wasRunning) {
      this.start();
    }
  }

  handleMessage(data, rinfo) {
    const srcAddr = `${rinfo.address}:${rinfo.port}`;
    const srcKey = `${rinfo.address}|${rinfo.port}`;

    // Check if this is from a forward endpoint
    const fromForward = this.forwards.find(f => f.host === rinfo.address && f.port === rinfo.port);

    if (fromForward) {
      // Packet from forward -> send back to mapped clients
      const fwdKey = `${fromForward.host}|${fromForward.port}`;
      const clients = this.mapping.get(fwdKey);

      if (clients && clients.size > 0) {
        let logMsg = `${srcAddr} -> `;
        clients.forEach((timestamp, clientAddr) => {
          const [clientIp, clientPort] = clientAddr.split('|');
          this.socket.send(data, clientPort, clientIp, (err) => {
            if (err) {
              this.emit('error', `Error sending to client ${clientAddr}: ${err.message}`);
            }
          });
        });
        logMsg += this.decodePayload(data);
        this.emit('log', logMsg);
      } else {
        this.emit('log', `${srcAddr} -> <no-mapping> (dropped) (${data.length} bytes)`);
      }

    } else {
      // Packet from client -> forward to all forwards
      let logMsg = '';
      if (rinfo.address == undefined) {
        logMsg += 'Manual QSO -> ';
      }else{
        logMsg += `${srcAddr} -> `;
      }

      this.forwards.forEach((fwd) => {
        this.socket.send(data, fwd.port, fwd.host, (err) => {
          if (err) {
            this.emit('error', `Error sending to forward ${fwd.host}:${fwd.port}: ${err.message}`);
          }
        });

        // Store mapping
        if (rinfo.address != undefined && rinfo.port != undefined) {
          const fwdKey = `${fwd.host}|${fwd.port}`;
          if (!this.mapping.has(fwdKey)) {
            this.mapping.set(fwdKey, new Map());
          }
          this.mapping.get(fwdKey).set(srcKey, Date.now());
        }
      });
      logMsg += this.decodePayload(data);
      this.emit('log', logMsg);  
    }
  }

  cleanup() {
    const cutoff = Date.now() - CLIENT_TIMEOUT;
    const forwardsToDelete = [];

    this.mapping.forEach((clients, fwdAddr) => {
      const clientsToDelete = [];
      clients.forEach((timestamp, clientAddr) => {
        if (timestamp < cutoff) {
          clientsToDelete.push(clientAddr);
        }
      });

      clientsToDelete.forEach(ca => clients.delete(ca));

      if (clients.size === 0) {
        forwardsToDelete.push(fwdAddr);
      }
    });

    forwardsToDelete.forEach(fa => this.mapping.delete(fa));
  }

  decodePayload(data) {
    let message = `Not decoded`;
    try {
      const parsed = new WsjtxUdpParser(data);
      if (parsed && parsed.type in parsed.MESSAGE_TYPES) {
        // Add type-specific information
        message = parsed.typeText;
        if (parsed.type === 1) {
            parsed.frequency = (Number(parsed.dialFrequency)/1000000).toFixed(4);
            
            message += ` Freq: ${parsed.frequency} MHz`;
            message += ` Mode: ${parsed.mode}`;
            if (parsed.txEnabled) {
                message += ` TX Enabled`;
            }
            if (parsed.transmitting) {
                message += ` Transmitting ${parsed.txMessage}`;
            }
            
            // Emit status update for UI indicators
            this.emit('status-update', parsed);
        } else if (parsed.type === 5) {
          // QSO Logged
          message += `${this.mode} ${this.dxCall} ${this.dialFrequency} ${this.dateTimeOff}`;
        } else if (parsed.type === 12) {
          message += ` ADIF: ${parsed.adif || ''}`;
          parsed.adifData.forEach((qso) => {
            this.emit('qso-logged', qso);
          });
        }
        message += ` ${parsed.message || ''}`;
      }else{
        message = `Unknown message type: ${parsed.type}`;
      }
    } catch (err) {
      this.emit('error', err);
    }
    return message
  }
}

module.exports = WSJTXRelay;
