#!/usr/bin/env node
/**
 * solo-bridge.js — MAVLink HTTP↔UDP bridge for 3DR Solo.
 *
 * Runs on your Mac (same WiFi as Solo). The phone app talks to this
 * bridge via HTTP, and the bridge talks to Solo via UDP MAVLink.
 *
 * Usage:
 *   node scripts/solo-bridge.js
 *
 * Solo must be powered on and your Mac connected to SoloLink_XXXXXX WiFi.
 * Bridge listens on port 8765 for HTTP from the phone.
 * Bridge sends/receives UDP to 10.1.1.1:14550 (Solo).
 *
 * Requirements: Node.js 18+ (no npm install needed — uses built-in modules)
 */

const http = require('http');
const dgram = require('dgram');

// ─── Config ────────────────────────────────────────────────────

const BRIDGE_PORT = 8765;
const SOLO_HOST = '10.1.1.1';
const SOLO_PORT = 14550;
const LOCAL_UDP_PORT = 14551; // Our listening port for Solo responses

// ─── State ─────────────────────────────────────────────────────

/** Buffer of received MAVLink messages (base64 encoded) */
let receivedMessages = [];
const MAX_BUFFER = 100;

/** Whether we've received a heartbeat from Solo recently */
let soloAlive = false;
let lastSoloHeartbeat = 0;

/** Pending command ACKs */
const pendingCommands = new Map(); // command -> { resolve, timer }

// ─── UDP Client (to Solo) ──────────────────────────────────────

const udpSocket = dgram.createSocket('udp4');

udpSocket.on('message', (msg, rinfo) => {
  // Store raw message as base64 for phone to poll
  const b64 = msg.toString('base64');
  receivedMessages.push(b64);
  if (receivedMessages.length > MAX_BUFFER) {
    receivedMessages = receivedMessages.slice(-MAX_BUFFER);
  }

  // Check for heartbeat (msgId at byte 5)
  if (msg.length >= 6 && msg[0] === 0xfe) {
    const msgId = msg[5];

    if (msgId === 0) { // HEARTBEAT
      soloAlive = true;
      lastSoloHeartbeat = Date.now();
    }

    // Check for COMMAND_ACK (msgId 77)
    if (msgId === 77 && msg.length >= 10) {
      const command = msg.readUInt16LE(6);
      const result = msg[8];
      const pending = pendingCommands.get(command);
      if (pending) {
        clearTimeout(pending.timer);
        pendingCommands.delete(command);
        pending.resolve({ command, result });
      }
    }
  }
});

udpSocket.on('error', (err) => {
  console.error('[UDP] Error:', err.message);
});

udpSocket.bind(LOCAL_UDP_PORT, () => {
  console.log(`[UDP] Listening on port ${LOCAL_UDP_PORT} for Solo responses`);
});

// Send a heartbeat to Solo every second to maintain connection
setInterval(() => {
  // Minimal GCS heartbeat: [0xFE, 9, seq, 255, 190, 0, payload(9), crc(2)]
  const heartbeat = Buffer.from([
    0xfe, 0x09, 0x00, 0xff, 0xbe, 0x00,
    0x00, 0x00, 0x00, 0x00, // custom_mode
    0x06, // type = GCS
    0x00, // autopilot = generic
    0x00, // base_mode
    0x00, // system_status
    0x03, // mavlink_version
    0x00, 0x00 // placeholder CRC (Solo usually accepts)
  ]);
  udpSocket.send(heartbeat, 0, heartbeat.length, SOLO_PORT, SOLO_HOST);

  // Check Solo liveness
  if (Date.now() - lastSoloHeartbeat > 5000) {
    if (soloAlive) {
      console.log('[Bridge] Solo heartbeat lost');
      soloAlive = false;
    }
  }
}, 1000);

// ─── HTTP Server (for phone) ───────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function respond(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${BRIDGE_PORT}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    respond(res, 200, { ok: true });
    return;
  }

  // ── Health check ──────────────────────────────────
  if (url.pathname === '/health') {
    respond(res, 200, {
      bridge: 'running',
      solo_connected: soloAlive,
      last_heartbeat_ms: Date.now() - lastSoloHeartbeat,
      buffered_messages: receivedMessages.length,
    });
    return;
  }

  // ── Send raw MAVLink packet to Solo ───────────────
  if (url.pathname === '/send' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.data) {
      respond(res, 400, { error: 'Missing data field' });
      return;
    }
    const buf = Buffer.from(body.data, 'base64');
    udpSocket.send(buf, 0, buf.length, SOLO_PORT, SOLO_HOST, (err) => {
      if (err) {
        respond(res, 500, { error: err.message });
      } else {
        respond(res, 200, { sent: true, bytes: buf.length });
      }
    });
    return;
  }

  // ── Receive buffered messages ─────────────────────
  if (url.pathname === '/recv') {
    const msgs = [...receivedMessages];
    receivedMessages = []; // Clear after read
    respond(res, 200, { messages: msgs });
    return;
  }

  // ── Send command and wait for ACK ─────────────────
  if (url.pathname === '/command' && req.method === 'POST') {
    const body = await parseBody(req);
    if (!body.data) {
      respond(res, 400, { error: 'Missing data field' });
      return;
    }

    const buf = Buffer.from(body.data, 'base64');
    const command = body.command;
    const timeout = body.timeout || 10000;

    // Set up ACK listener
    const ackPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingCommands.delete(command);
        resolve({ command, result: -1 }); // timeout
      }, timeout);
      pendingCommands.set(command, { resolve, timer });
    });

    // Send the packet
    udpSocket.send(buf, 0, buf.length, SOLO_PORT, SOLO_HOST);

    // Wait for ACK
    const ack = await ackPromise;

    if (ack.result === -1) {
      respond(res, 200, { success: false, message: `Command ${command} timed out`, ack });
    } else if (ack.result === 0) {
      respond(res, 200, { success: true, message: `Command ${command} accepted`, ack });
    } else {
      respond(res, 200, { success: false, message: `Command ${command} rejected (result=${ack.result})`, ack });
    }
    return;
  }

  // ── Relative movement via velocity ────────────────
  if (url.pathname === '/move' && req.method === 'POST') {
    const body = await parseBody(req);
    const { forward_m = 0, right_m = 0, up_m = 0 } = body;

    // Convert distance to velocity over ~2 seconds
    const speed = 2.0; // m/s
    const duration = Math.max(
      Math.abs(forward_m), Math.abs(right_m), Math.abs(up_m)
    ) / speed;

    // SET_POSITION_TARGET_LOCAL_NED with velocity mask
    // type_mask: 0b0000111111000111 = 0x0FC7 (use vx, vy, vz only)
    const payload = Buffer.alloc(53);
    payload.writeUInt32LE(0, 0);           // time_boot_ms
    payload.writeFloatLE(0, 4);            // x (unused)
    payload.writeFloatLE(0, 8);            // y (unused)
    payload.writeFloatLE(0, 12);           // z (unused)
    payload.writeFloatLE(forward_m > 0 ? speed : forward_m < 0 ? -speed : 0, 16);  // vx (North)
    payload.writeFloatLE(right_m > 0 ? speed : right_m < 0 ? -speed : 0, 20);     // vy (East)
    payload.writeFloatLE(up_m > 0 ? -speed : up_m < 0 ? speed : 0, 24);           // vz (Down=positive in NED)
    payload.writeFloatLE(0, 28);           // afx
    payload.writeFloatLE(0, 32);           // afy
    payload.writeFloatLE(0, 36);           // afz
    payload.writeFloatLE(0, 40);           // yaw
    payload.writeFloatLE(0, 44);           // yaw_rate
    payload.writeUInt16LE(0x0FC7, 48);     // type_mask
    payload.writeUInt8(1, 50);             // target_system
    payload.writeUInt8(1, 51);             // target_component
    payload.writeUInt8(9, 52);             // MAV_FRAME_BODY_OFFSET_NED

    // Build MAVLink packet manually for this
    const header = Buffer.from([0xfe, 53, 0, 255, 190, 84]); // msgId 84
    const packet = Buffer.concat([header, payload, Buffer.alloc(2)]); // CRC placeholder

    udpSocket.send(packet, 0, packet.length, SOLO_PORT, SOLO_HOST);

    // Send for duration, then stop
    setTimeout(() => {
      // Send zero velocity to stop
      const stopPayload = Buffer.alloc(53);
      stopPayload.writeUInt16LE(0x0FC7, 48);
      stopPayload.writeUInt8(1, 50);
      stopPayload.writeUInt8(1, 51);
      stopPayload.writeUInt8(9, 52);
      const stopPacket = Buffer.concat([header, stopPayload, Buffer.alloc(2)]);
      udpSocket.send(stopPacket, 0, stopPacket.length, SOLO_PORT, SOLO_HOST);
    }, duration * 1000);

    respond(res, 200, {
      success: true,
      message: `Moving ${duration.toFixed(1)}s at ${speed}m/s`,
    });
    return;
  }

  respond(res, 404, { error: 'Not found' });
});

server.listen(BRIDGE_PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║          ZeroEffort Solo MAVLink Bridge              ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Bridge:  http://0.0.0.0:${BRIDGE_PORT}                     ║`);
  console.log(`║  Solo:    ${SOLO_HOST}:${SOLO_PORT} (UDP)                  ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  1. Connect Mac to SoloLink_XXXXXX WiFi             ║');
  console.log('║  2. Phone stays on same WiFi (+ cellular for data)  ║');
  console.log('║  3. In app, connect to Solo via Settings            ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  Endpoints:                                         ║');
  console.log('║    GET  /health  — bridge + Solo status              ║');
  console.log('║    POST /send    — send MAVLink packet               ║');
  console.log('║    GET  /recv    — poll received messages            ║');
  console.log('║    POST /command — send + wait for ACK               ║');
  console.log('║    POST /move    — relative velocity movement        ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Waiting for Solo heartbeat...');
});
