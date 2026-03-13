const dgram = require('dgram');
const dns = require('dns');
const EventEmitter = require('events');
const { WsjtxUdpParser } = require('./WsjtxUdpParser');
const { AdiWriter } = require('./adif/AdiWriter');
const { app } = require('electron');

const version = app.getVersion();
const CLIENT_TIMEOUT = 60000; // milliseconds

class WSJTXRelay extends EventEmitter {
  constructor(listenPort = 2237, forwards = [], forwardDelaySeconds = 0.5) {
    super();
    this.listenAddress = '0.0.0.0';
    this.listenPort = listenPort;
    this.forwards = forwards; // Array of {host, port}
    this.forwardDelayMs = this.toDelayMs(forwardDelaySeconds);
    this.socket = null;
    this.running = false;
    this.mapping = new Map(); // forward addr -> Map of client addr -> timestamp
    this.forwardHostAddressMap = new Map(); // host -> Set of resolved IPv4 addresses
    this.pendingHostLookups = new Set();
    this.cleanupInterval = null;
    this.lastStatusSnapshot = null;
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
      const activeForwards = this.getActiveForwards();
      this.emit(
        'log',
        `Listening on ${this.listenAddress}:${this.listenPort}, forwarding to: ${activeForwards.map((f) => `${f.host}:${f.port}`).join(', ') || '<none-enabled>'}`,
      );
      this.emit('status', 'running');
    });

    this.refreshForwardHostAddressMap();

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

  updateSettings(listenPort, forwards, forwardDelaySeconds = 0.5) {
    const nextForwards = Array.isArray(forwards) ? forwards : [];
    const nextDelayMs = this.toDelayMs(forwardDelaySeconds);

    // Only restart the relay if the listen/forwards change
    if (
      listenPort === this.listenPort &&
      this.forwardDelayMs === nextDelayMs &&
      this.areForwardsEqual(this.forwards, nextForwards)
    ) {
      return;
    }
    const wasRunning = this.running;
    if (wasRunning) {
      this.stop();
    }

    this.listenPort = listenPort;
    this.forwards = nextForwards;
    this.forwardDelayMs = nextDelayMs;
    this.refreshForwardHostAddressMap();

    if (wasRunning) {
      this.start();
    }
  }

  handleMessage(data, rinfo) {
    const srcAddr = `${rinfo.address}:${rinfo.port}`;
    const srcKey = `${rinfo.address}|${rinfo.port}`;

    // Check if this is from a configured forward endpoint
    const forwardConfig = this.forwards.find((f) => this.matchesForwardSource(f, rinfo));
    const fromForward = forwardConfig && !forwardConfig.disabled ? forwardConfig : null;

    if (forwardConfig && forwardConfig.disabled) {
      this.emit('log', `${srcAddr} -> <disabled-forward> (dropped) (${data.length} bytes)`);
      return;
    }

    const activeForwards = this.getActiveForwards();

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
        logMsg += this.decodePayload(data, rinfo);
        this.emit('log', logMsg);
      } else {
        this.emit('log', `${srcAddr} -> <no-mapping> (dropped) (${data.length} bytes)`);
      }
    } else {
      // Packet from client -> forward to all forwards
      let logMsg = '';
      if (rinfo.address == undefined) {
        logMsg += 'Manual QSO -> ';
      } else {
        logMsg += `${srcAddr} -> `;
      }

      activeForwards.forEach((fwd) => {
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
      logMsg += this.decodePayload(data, rinfo);
      if (activeForwards.length === 0) {
        this.emit('log', `${srcAddr} -> <no-enabled-forwards> (dropped) (${data.length} bytes)`);
        return;
      }
      this.emit('log', logMsg);
    }
  }

  getActiveForwards() {
    return this.forwards.filter((fwd) => !fwd.disabled);
  }

  matchesForwardSource(forward, rinfo) {
    if (!forward || !rinfo) {
      return false;
    }

    if (Number(forward.port) !== Number(rinfo.port)) {
      return false;
    }

    if (forward.host === rinfo.address) {
      return true;
    }

    const knownAddresses = this.forwardHostAddressMap.get(forward.host);
    if (knownAddresses && knownAddresses.has(rinfo.address)) {
      return true;
    }

    // Keep resolution cache warm for hostnames, so reverse packets map correctly.
    this.lookupForwardHost(forward.host);
    return false;
  }

  refreshForwardHostAddressMap() {
    this.forwardHostAddressMap.clear();

    this.forwards.forEach((forward) => {
      if (!forward || !forward.host) {
        return;
      }

      this.lookupForwardHost(forward.host);
    });
  }

  async lookupForwardHost(host) {
    if (!host || this.pendingHostLookups.has(host)) {
      return;
    }

    if (this.isValidIPv4(host)) {
      this.forwardHostAddressMap.set(host, new Set([host]));
      return;
    }

    this.pendingHostLookups.add(host);
    try {
      const results = await dns.promises.lookup(host, {
        family: 4,
        all: true,
        verbatim: true,
      });

      const addresses = (results || []).map((entry) => entry.address).filter(Boolean);
      if (addresses.length > 0) {
        this.forwardHostAddressMap.set(host, new Set(addresses));
      }
    } catch (err) {
      this.emit('error', `Unable to resolve forward host ${host}: ${err.message}`);
    } finally {
      this.pendingHostLookups.delete(host);
    }
  }

  isValidIPv4(ip) {
    return /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/.test(
      ip,
    );
  }

  areForwardsEqual(currentForwards, nextForwards) {
    if (!Array.isArray(currentForwards) || !Array.isArray(nextForwards)) {
      return false;
    }

    if (currentForwards.length !== nextForwards.length) {
      return false;
    }

    for (let index = 0; index < currentForwards.length; index += 1) {
      const current = currentForwards[index] || {};
      const next = nextForwards[index] || {};

      if (
        current.host !== next.host ||
        Number(current.port) !== Number(next.port) ||
        Boolean(current.disabled) !== Boolean(next.disabled)
      ) {
        return false;
      }
    }

    return true;
  }

  toDelayMs(forwardDelaySeconds) {
    const parsed = Number(forwardDelaySeconds);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 500;
    }
    return Math.round(parsed * 1000);
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

      clientsToDelete.forEach((ca) => clients.delete(ca));

      if (clients.size === 0) {
        forwardsToDelete.push(fwdAddr);
      }
    });

    forwardsToDelete.forEach((fa) => this.mapping.delete(fa));
  }

  decodePayload(data, rinfo = null) {
    let message = `Not decoded`;
    try {
      const parsed = new WsjtxUdpParser(data);
      if (parsed && parsed.type in parsed.MESSAGE_TYPES) {
        // Add type-specific information
        message = parsed.typeText;
        if (parsed.type === 1) {
          parsed.frequency = (Number(parsed.dialFrequency) / 1000000).toFixed(4);

          message += ` Freq: ${parsed.frequency} MHz`;
          message += ` Mode: ${parsed.mode}`;
          if (parsed.txEnabled) {
            message += ` TX Enabled`;
          }
          if (parsed.transmitting) {
            message += ` Transmitting ${parsed.txMessage}`;
          }

          this.lastStatusSnapshot = {
            mode: String(parsed.mode || ''),
            dialFrequency: Number(parsed.dialFrequency),
          };

          // Emit status update for UI indicators
          this.emit('status-update', parsed);
        } else if (parsed.type === 2) {
          // Decode
          const decodeMode = String(parsed.mode || '').trim();
          const fallbackMode = String(this.lastStatusSnapshot?.mode || '').trim();
          const resolvedMode = decodeMode && decodeMode !== '~' && decodeMode !== '+'
            ? decodeMode
            : fallbackMode;

          this.emit('decode-packet', {
            time: Number(parsed.time),
            message: String(parsed.message || ''),
            snr: Number(parsed.snr),
            deltaTime: Number(parsed.delta_time),
            mode: resolvedMode,
            rawMode: decodeMode,
            utcTime: String(parsed.time_utc || ''),
            deltaFreq: Number(parsed.delta_freq),
            dialFrequency: Number(this.lastStatusSnapshot?.dialFrequency),
            wsjtxId: String(parsed.id || ''),
            sourceHost: String(rinfo?.address || ''),
            sourcePort: Number(rinfo?.port),
            lowConfidence: Boolean(parsed.lowconfidence),
            modifiers: Number(parsed.offair),
          });
        } else if (parsed.type === 4) {
          // Reply
          message += ` ${parsed.mode}`;
        } else if (parsed.type === 5) {
          // QSO Logged
          message += ` ${parsed.mode} ${parsed.dxCall} ${parsed.dialFrequency} ${parsed.timeOn} ${parsed.timeOff}`;
        } else if (parsed.type === 12) {
          message += ` ADIF: ${parsed.adif || ''}`;
          parsed.adifData.forEach((qso) => {
            this.emit('qso-logged', qso);
          });
        }
        message += ` ${parsed.message || ''}`;
      } else {
        message = `Unknown message type: ${parsed.type}`;
      }
    } catch (err) {
      this.emit('error', err);
    }
    return message;
  }

  createAdifPacket(qso) {
    // This is where we create a WSJT-X Type 12 Packet and send it to all the forwards
    const adiWriter = new AdiWriter('WSJT-X Relay', version);
    adiWriter.writeContact(qso);
    const adif = adiWriter.getData();
    const magicBytes = Buffer.from([0xad, 0xbc, 0xcb, 0xda]);
    const protoVersion = Buffer.from([0x00, 0x00, 0x00, 0x02]);
    const type = Buffer.from([0x00, 0x00, 0x00, 0x0c]); // 12 -> ADIF
    const id = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x06]), Buffer.from('WSJT-X')]);
    const adif_length = Buffer.alloc(4);
    adif_length.writeUint32BE(adif.length);
    const adif_buffer = Buffer.from(adif);
    const packet = Buffer.concat([magicBytes, protoVersion, type, id, adif_length, adif_buffer]);
    // packet is ready to go.... SEND IT!
    return packet;
  }

  async resendQsos(qsos) {
    if (!Array.isArray(qsos)) {
      qsos = [qsos];
    }

    const activeForwards = this.getActiveForwards();

    if (activeForwards.length === 0) {
      this.emit('log', 'No enabled forwarders configured - QSOs not forwarded');
      return;
    }

    for (let index = 0; index < qsos.length; index += 1) {
      const qso = qsos[index];
      const qsoInfo = `${qso.call || 'UNKNOWN'} ${qso.band || '?'} ${qso.mode || '?'} ${qso.start || 'N/A'}`;

      // Convert QSO to JSON and send as UDP packet to each forwarder
      const buffer = this.createAdifPacket(qso);

      await Promise.all(
        activeForwards.map(
          (fwd) =>
            new Promise((resolve) => {
              this.socket.send(buffer, fwd.port, fwd.host, (err) => {
                if (err) {
                  this.emit(
                    'error',
                    `Error sending QSO to ${fwd.host}:${fwd.port}: ${err.message}`,
                  );
                } else {
                  this.emit('log', `Sending -> ${fwd.host}:${fwd.port} ${qsoInfo}`);
                }
                resolve();
              });
            }),
        ),
      );

      // Only send type 12 packet as Gridtracker was complaining it was a duplicate QSO
      // Send QSO Logged packet after ADIF packet
      // const qsoLoggedBuffer = this.createQsoLoggedPacket(qso);
      // await Promise.all(
      //   activeForwards.map(
      //     (fwd) =>
      //       new Promise((resolve) => {
      //         this.socket.send(qsoLoggedBuffer, fwd.port, fwd.host, (err) => {
      //           if (err) {
      //             this.emit(
      //               'error',
      //               `Error sending QSO Logged to ${fwd.host}:${fwd.port}: ${err.message}`,
      //             );
      //           } else {
      //             this.emit('log', `QSO Logged -> ${fwd.host}:${fwd.port} ${qsoInfo}`);
      //           }
      //           resolve();
      //         });
      //       }),
      //   ),
      // );
      if (this.forwardDelayMs > 0 && index < qsos.length - 1) {
        await this.sleep(this.forwardDelayMs);
      }
    }
  }

  createQsoLoggedPacket(qso) {
    // Construct WSJT-X Type 5 (QSO Logged) packet
    // Reference: WsjtxUdpParser.parseQSOLoggedMessage
    const magicBytes = Buffer.from([0xad, 0xbc, 0xcb, 0xda]);
    const version = Buffer.from([0x00, 0x00, 0x00, 0x02]);
    const type = Buffer.from([0x00, 0x00, 0x00, 0x05]); // 5 -> QSO Logged
    const id = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x06]), Buffer.from('WSJT-X')]);

    // Helper to encode string as WSJT-X packet field
    function encodeString(str) {
      if (!str) str = '';
      const buf = Buffer.from(str, 'utf8');
      const len = Buffer.alloc(4);
      len.writeUInt32BE(buf.length);
      return Buffer.concat([len, buf]);
    }

    // Helper to encode 64-bit integer (date/time)
    function encodeUint64(val) {
      const buf = Buffer.alloc(8);
      if (typeof val === 'bigint') {
        buf.writeBigUInt64BE(val);
      } else {
        buf.writeBigUInt64BE(BigInt(val || 0));
      }
      return buf;
    }

    // Helper to encode 32-bit integer
    function encodeUint32(val) {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(val || 0);
      return buf;
    }

    // Helper to encode 8-bit integer
    function encodeUint8(val) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(val || 0);
      return buf;
    }

    function normalizeDateDigits(value) {
      return String(value || '')
        .replace(/[^0-9]/g, '')
        .trim();
    }

    function normalizeTimeDigits(value) {
      return String(value || '')
        .replace(/[^0-9]/g, '')
        .trim();
    }

    function isFiniteInteger(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && Number.isInteger(parsed);
    }

    function toQtDateAndTimeFromDate(date) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      const hour = date.getUTCHours();
      const minute = date.getUTCMinutes();
      const second = date.getUTCSeconds();
      const millisecond = date.getUTCMilliseconds();

      const MS_PER_DAY = 24 * 60 * 60 * 1000;
      const JULIAN_UNIX_EPOCH = 2440588;
      const utcMidnight = Date.UTC(year, month, day);
      const qtDate = Math.floor(utcMidnight / MS_PER_DAY) + JULIAN_UNIX_EPOCH;
      const qtTime = hour * 60 * 60 * 1000 + minute * 60 * 1000 + second * 1000 + millisecond;

      return { qtDate, qtTime };
    }

    function parseQtDateAndTimeFromIso(value) {
      const candidate = String(value || '').trim();
      if (!candidate) {
        return null;
      }

      const parsedDate = new Date(candidate);
      if (Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      return toQtDateAndTimeFromDate(parsedDate);
    }

    function parseQtDateAndTimeFromAdif(dateValue, timeValue) {
      const dateDigits = normalizeDateDigits(dateValue);
      if (dateDigits.length !== 8) {
        return null;
      }

      const year = Number.parseInt(dateDigits.slice(0, 4), 10);
      const month = Number.parseInt(dateDigits.slice(4, 6), 10);
      const day = Number.parseInt(dateDigits.slice(6, 8), 10);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
      }

      const rawTimeDigits = normalizeTimeDigits(timeValue);
      const paddedTime = (rawTimeDigits || '000000').padEnd(6, '0').slice(0, 6);
      const hour = Number.parseInt(paddedTime.slice(0, 2), 10);
      const minute = Number.parseInt(paddedTime.slice(2, 4), 10);
      const second = Number.parseInt(paddedTime.slice(4, 6), 10);

      if (
        !Number.isFinite(hour) ||
        !Number.isFinite(minute) ||
        !Number.isFinite(second) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59 ||
        second < 0 ||
        second > 59
      ) {
        return null;
      }

      const parsedDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
      if (Number.isNaN(parsedDate.getTime())) {
        return null;
      }

      return toQtDateAndTimeFromDate(parsedDate);
    }

    function resolveQtDateAndTime({
      qtDateCandidate,
      qtTimeCandidate,
      adifDate,
      adifTime,
      isoTimestamp,
    }) {
      if (isFiniteInteger(qtDateCandidate) && isFiniteInteger(qtTimeCandidate)) {
        return {
          qtDate: Number(qtDateCandidate),
          qtTime: Number(qtTimeCandidate),
        };
      }

      const fromAdif = parseQtDateAndTimeFromAdif(adifDate, adifTime);
      if (fromAdif) {
        return fromAdif;
      }

      const fromIso = parseQtDateAndTimeFromIso(isoTimestamp);
      if (fromIso) {
        return fromIso;
      }

      return { qtDate: 0, qtTime: 0 };
    }

    // Map QSO fields to QSO Logged packet fields
    // These should match the order in parseQSOLoggedMessage
    const onDateTime = resolveQtDateAndTime({
      qtDateCandidate: qso.dateOn,
      qtTimeCandidate: qso.timeOn,
      adifDate: qso.date_on || qso.qso_date,
      adifTime: qso.time_on,
      isoTimestamp: qso.start,
    });

    const offDateTime = resolveQtDateAndTime({
      qtDateCandidate: qso.dateOff,
      qtTimeCandidate: qso.timeOff,
      adifDate: qso.date_off || qso.qso_date_off || qso.date_on || qso.qso_date,
      adifTime: qso.time_off || qso.time_on,
      isoTimestamp: qso.end || qso.start,
    });

    // Date/time off
    const dateOff = offDateTime.qtDate;
    const timeOff = offDateTime.qtTime;
    const timespecOff = qso.timespecOff || 0;
    const offsetOff = qso.offsetOff || 0;
    // QSO details
    const dxCall = qso.dxCall || qso.call || '';
    const dxGrid = qso.dxGrid || qso.grid || qso.gridsquare || '';
    // Frequency: try all possible field names and normalize to integer Hz
    let dialFrequency = qso.dialFrequency || qso.freq || qso.frequency || 0;
    if (typeof dialFrequency === 'string') dialFrequency = parseFloat(dialFrequency);
    if (typeof dialFrequency === 'number' && dialFrequency < 1000 && dialFrequency > 0) {
      // Assume MHz, convert to Hz
      dialFrequency = Math.round(dialFrequency * 1e6);
    } else {
      dialFrequency = Math.round(dialFrequency);
    }
    // Mode
    const mode = qso.mode || qso.submode || '';
    // RST Sent
    const rstSent = qso.rstSent || qso.rst_sent || qso.rst || '';
    // RST Received
    const rptRcvd = qso.rptRcvd || qso.rst_rcvd || qso.rcvd || '';
    // Power: try all possible field names
    const txPwr = qso.txPwr || qso.tx_pwr || qso.power || qso.rx_pwr || '';
    // Comments
    const comments = qso.comments || qso.comment || '';
    // Name
    const name = qso.name || '';
    // Date/time on
    const dateOn = onDateTime.qtDate;
    const timeOn = onDateTime.qtTime;
    const timespecOn = qso.timespecOn || 0;
    const offsetOn = qso.offsetOn || 0;
    // Operator and station
    const operator = qso.operator || '';
    const deCall = qso.deCall || qso.my_call || qso.station_callsign || '';
    const deGrid = qso.deGrid || qso.my_gridsquare || '';
    const exchangeSent = qso.exchangeSent || '';
    const exchangeRcvd = qso.exchangeRcvd || '';

    // Build packet
    let fields = [encodeUint64(dateOff), encodeUint32(timeOff), encodeUint8(timespecOff)];
    if (timespecOff == 2) fields.push(encodeUint32(offsetOff));
    fields = fields.concat([
      encodeString(dxCall),
      encodeString(dxGrid),
      encodeUint64(dialFrequency),
      encodeString(mode),
      encodeString(rstSent),
      encodeString(rptRcvd),
      encodeString(txPwr),
      encodeString(comments),
      encodeString(name),
      encodeUint64(dateOn),
      encodeUint32(timeOn),
      encodeUint8(timespecOn),
    ]);
    if (timespecOn == 2) fields.push(encodeUint32(offsetOn));
    fields = fields.concat([
      encodeString(operator),
      encodeString(deCall),
      encodeString(deGrid),
      encodeString(exchangeSent),
      encodeString(exchangeRcvd),
    ]);

    const packet = Buffer.concat([magicBytes, version, type, id, ...fields]);
    return packet;
  }

  createReplyPacket(decodePacket) {
    const magicBytes = Buffer.from([0xad, 0xbc, 0xcb, 0xda]);
    const versionBytes = Buffer.from([0x00, 0x00, 0x00, 0x02]);
    const typeBytes = Buffer.from([0x00, 0x00, 0x00, 0x04]);
    const idText = String(decodePacket?.wsjtxId || 'WSJT-X');
    const idBuffer = Buffer.from(idText, 'utf8');
    const idLength = Buffer.alloc(4);
    idLength.writeUInt32BE(idBuffer.length);
    const id = Buffer.concat([idLength, idBuffer]);

    function encodeString(str) {
      const value = String(str || '');
      const buf = Buffer.from(value, 'utf8');
      const len = Buffer.alloc(4);
      len.writeUInt32BE(buf.length);
      return Buffer.concat([len, buf]);
    }

    function encodeUint32(val) {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(Number.isFinite(val) ? Math.max(0, Math.trunc(val)) : 0);
      return buf;
    }

    function encodeInt32(val) {
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(Number.isFinite(val) ? Math.trunc(val) : 0);
      return buf;
    }

    function encodeDouble(val) {
      const buf = Buffer.alloc(8);
      buf.writeDoubleBE(Number.isFinite(val) ? val : 0);
      return buf;
    }

    function encodeBool(val) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(val ? 1 : 0);
      return buf;
    }

    function encodeUint8(val) {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(Number.isFinite(val) ? Math.max(0, Math.trunc(val)) & 0xff : 0);
      return buf;
    }

    const rawMode = String(decodePacket?.rawMode || '').trim();
    const replyMode = rawMode || String(decodePacket?.mode || '');

    const fields = [
      encodeUint32(Number(decodePacket?.time)),
      encodeInt32(Number(decodePacket?.snr)),
      encodeDouble(Number(decodePacket?.deltaTime)),
      encodeUint32(Number(decodePacket?.deltaFreq)),
      encodeString(replyMode),
      encodeString(decodePacket?.message),
      encodeBool(Boolean(decodePacket?.lowConfidence)),
      encodeUint8(Number(decodePacket?.modifiers)),
    ];

    return Buffer.concat([magicBytes, versionBytes, typeBytes, id, ...fields]);
  }

  sendPacketUpstream(packet) {
    if (!this.running || !this.socket) {
      throw new Error('Relay not running');
    }

    const destinations = new Set();
    this.mapping.forEach((clients) => {
      clients.forEach((timestamp, clientAddr) => {
        destinations.add(clientAddr);
      });
    });

    if (destinations.size === 0) {
      throw new Error('No upstream WSJT-X clients have been seen');
    }

    return Promise.all(
      Array.from(destinations).map(
        (clientAddr) =>
          new Promise((resolve, reject) => {
            const [clientHost, clientPort] = String(clientAddr).split('|');
            this.socket.send(packet, Number(clientPort), clientHost, (err) => {
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          }),
      ),
    );
  }

  sendPacketToEndpoint(packet, host, port) {
    if (!this.running || !this.socket) {
      throw new Error('Relay not running');
    }

    const targetHost = String(host || '').trim();
    const targetPort = Number(port);

    if (!targetHost || !Number.isInteger(targetPort) || targetPort <= 0 || targetPort > 65535) {
      throw new Error('Invalid upstream endpoint');
    }

    return new Promise((resolve, reject) => {
      this.socket.send(packet, targetPort, targetHost, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async sendReplyPacket(decodePacket) {
    const packet = this.createReplyPacket(decodePacket);
    const sourceHost = String(decodePacket?.sourceHost || '').trim();
    const sourcePort = Number(decodePacket?.sourcePort);

    if (sourceHost && Number.isInteger(sourcePort) && sourcePort > 0 && sourcePort <= 65535) {
      await this.sendPacketToEndpoint(packet, sourceHost, sourcePort);
      this.emit(
        'log',
        `Reply packet sent upstream to ${sourceHost}:${sourcePort} for ${String(decodePacket?.message || '').trim() || '<empty decode>'}`,
      );
      return;
    }

    await this.sendPacketUpstream(packet);
    this.emit(
      'log',
      `Reply packet sent upstream for ${String(decodePacket?.message || '').trim() || '<empty decode>'}`,
    );
  }
}

module.exports = WSJTXRelay;
