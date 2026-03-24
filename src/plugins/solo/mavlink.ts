/**
 * mavlink.ts — Minimal MAVLink v1 protocol for 3DR Solo.
 *
 * Solo runs ArduPilot (ArduCopter) and speaks MAVLink v1 over UDP.
 * This module encodes/decodes the essential messages needed for
 * ZeroEffort drone control.
 *
 * MAVLink v1 packet: [0xFE, len, seq, sysid, compid, msgid, payload..., crc_lo, crc_hi]
 */

// ─── Constants ─────────────────────────────────────────────────

export const MAVLINK_START = 0xfe;

/** Our system ID (ground station) */
export const GCS_SYSTEM_ID = 255;
export const GCS_COMPONENT_ID = 190;

/** Solo's system ID */
export const SOLO_SYSTEM_ID = 1;
export const SOLO_COMPONENT_ID = 1;

// ─── Message IDs ───────────────────────────────────────────────

export const MSG = {
  HEARTBEAT: 0,
  SYS_STATUS: 1,
  GPS_RAW_INT: 24,
  ATTITUDE: 30,
  GLOBAL_POSITION_INT: 33,
  VFR_HUD: 74,
  COMMAND_LONG: 76,
  COMMAND_ACK: 77,
  SET_MODE: 11,
  SET_POSITION_TARGET_LOCAL_NED: 84,
  REQUEST_DATA_STREAM: 66,
} as const;

// ─── ArduCopter Flight Modes ───────────────────────────────────

export const COPTER_MODE = {
  STABILIZE: 0,
  GUIDED: 4,
  LOITER: 5,
  RTL: 6,
  LAND: 9,
  POSHOLD: 16,
} as const;

// ─── MAV Commands ──────────────────────────────────────────────

export const MAV_CMD = {
  NAV_RETURN_TO_LAUNCH: 20,
  NAV_LAND: 21,
  NAV_TAKEOFF: 22,
  DO_SET_MODE: 176,
  DO_DIGICAM_CONTROL: 203,
  COMPONENT_ARM_DISARM: 400,
  SET_MESSAGE_INTERVAL: 511,
} as const;

// ─── MAV Result (from COMMAND_ACK) ─────────────────────────────

export const MAV_RESULT = {
  ACCEPTED: 0,
  TEMPORARILY_REJECTED: 1,
  DENIED: 2,
  UNSUPPORTED: 3,
  FAILED: 4,
  IN_PROGRESS: 5,
} as const;

// ─── Base Mode Flags ───────────────────────────────────────────

export const MAV_MODE_FLAG = {
  CUSTOM_MODE_ENABLED: 1,
  SAFETY_ARMED: 128,
} as const;

// ─── CRC-16/MCRF4XX (X.25) ────────────────────────────────────

const CRC_EXTRA: Record<number, number> = {
  [MSG.HEARTBEAT]: 50,
  [MSG.SYS_STATUS]: 124,
  [MSG.SET_MODE]: 89,
  [MSG.GPS_RAW_INT]: 24,
  [MSG.ATTITUDE]: 39,
  [MSG.GLOBAL_POSITION_INT]: 104,
  [MSG.VFR_HUD]: 20,
  [MSG.COMMAND_LONG]: 152,
  [MSG.COMMAND_ACK]: 143,
  [MSG.REQUEST_DATA_STREAM]: 119,
  [MSG.SET_POSITION_TARGET_LOCAL_NED]: 143,
};

function crc16Accumulate(byte: number, crc: number): number {
  let tmp = byte ^ (crc & 0xff);
  tmp ^= (tmp << 4) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

function crc16(buffer: Uint8Array, msgId: number): number {
  let crc = 0xffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = crc16Accumulate(buffer[i]!, crc);
  }
  // Add CRC_EXTRA for the message type
  const extra = CRC_EXTRA[msgId];
  if (extra !== undefined) {
    crc = crc16Accumulate(extra, crc);
  }
  return crc;
}

// ─── Packet Builder ────────────────────────────────────────────

let sequenceCounter = 0;

export function buildPacket(
  msgId: number,
  payload: Uint8Array,
  systemId: number = GCS_SYSTEM_ID,
  componentId: number = GCS_COMPONENT_ID
): Uint8Array {
  const seq = sequenceCounter++ & 0xff;
  const header = new Uint8Array([
    MAVLINK_START,
    payload.length,
    seq,
    systemId,
    componentId,
    msgId,
  ]);

  // CRC covers: len, seq, sysid, compid, msgid, payload
  const crcBuffer = new Uint8Array(5 + payload.length);
  crcBuffer[0] = payload.length;
  crcBuffer[1] = seq;
  crcBuffer[2] = systemId;
  crcBuffer[3] = componentId;
  crcBuffer[4] = msgId;
  crcBuffer.set(payload, 5);

  const crc = crc16(crcBuffer, msgId);

  const packet = new Uint8Array(6 + payload.length + 2);
  packet.set(header, 0);
  packet.set(payload, 6);
  packet[6 + payload.length] = crc & 0xff;
  packet[6 + payload.length + 1] = (crc >> 8) & 0xff;

  return packet;
}

// ─── Message Encoders ──────────────────────────────────────────

/** Build a HEARTBEAT packet (sent every 1s to maintain connection) */
export function encodeHeartbeat(): Uint8Array {
  const payload = new Uint8Array(9);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, 0, true); // custom_mode
  dv.setUint8(4, 6);        // type: MAV_TYPE_GCS
  dv.setUint8(5, 0);        // autopilot: generic
  dv.setUint8(6, 0);        // base_mode
  dv.setUint8(7, 0);        // system_status: uninit
  dv.setUint8(8, 3);        // mavlink_version
  return buildPacket(MSG.HEARTBEAT, payload);
}

/** Build a COMMAND_LONG packet */
export function encodeCommandLong(
  command: number,
  param1 = 0, param2 = 0, param3 = 0, param4 = 0,
  param5 = 0, param6 = 0, param7 = 0,
  targetSystem: number = SOLO_SYSTEM_ID,
  targetComponent: number = SOLO_COMPONENT_ID
): Uint8Array {
  const payload = new Uint8Array(33);
  const dv = new DataView(payload.buffer);
  dv.setFloat32(0, param1, true);
  dv.setFloat32(4, param2, true);
  dv.setFloat32(8, param3, true);
  dv.setFloat32(12, param4, true);
  dv.setFloat32(16, param5, true);
  dv.setFloat32(20, param6, true);
  dv.setFloat32(24, param7, true);
  dv.setUint16(28, command, true);
  dv.setUint8(30, targetSystem);
  dv.setUint8(31, targetComponent);
  dv.setUint8(32, 0); // confirmation
  return buildPacket(MSG.COMMAND_LONG, payload);
}

/** Build a SET_MODE packet */
export function encodeSetMode(
  customMode: number,
  targetSystem: number = SOLO_SYSTEM_ID
): Uint8Array {
  const payload = new Uint8Array(6);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, customMode, true); // custom_mode
  dv.setUint8(4, targetSystem);       // target_system
  dv.setUint8(5, MAV_MODE_FLAG.CUSTOM_MODE_ENABLED | MAV_MODE_FLAG.SAFETY_ARMED); // base_mode
  return buildPacket(MSG.SET_MODE, payload);
}

/** Build REQUEST_DATA_STREAM (ask Solo to send telemetry) */
export function encodeRequestDataStream(
  streamId: number,
  rateHz: number,
  targetSystem: number = SOLO_SYSTEM_ID,
  targetComponent: number = SOLO_COMPONENT_ID
): Uint8Array {
  const payload = new Uint8Array(6);
  const dv = new DataView(payload.buffer);
  dv.setUint16(0, rateHz, true);    // req_message_rate
  dv.setUint8(2, targetSystem);
  dv.setUint8(3, targetComponent);
  dv.setUint8(4, streamId);          // req_stream_id
  dv.setUint8(5, 1);                 // start_stop (1 = start)
  return buildPacket(MSG.REQUEST_DATA_STREAM, payload);
}

// ─── Message Decoders ──────────────────────────────────────────

export interface MavlinkMessage {
  msgId: number;
  systemId: number;
  componentId: number;
  sequence: number;
  payload: DataView;
}

export interface HeartbeatData {
  customMode: number;
  type: number;
  autopilot: number;
  baseMode: number;
  systemStatus: number;
  isArmed: boolean;
}

export interface GlobalPositionData {
  lat: number;       // degrees
  lon: number;       // degrees
  alt: number;       // meters MSL
  relativeAlt: number; // meters above home
  heading: number;   // degrees
  vx: number;        // m/s
  vy: number;        // m/s
  vz: number;        // m/s
}

export interface SysStatusData {
  batteryVoltage: number;   // volts
  batteryCurrent: number;   // amps
  batteryRemaining: number; // percent 0-100
}

export interface VfrHudData {
  airspeed: number;     // m/s
  groundspeed: number;  // m/s
  heading: number;      // degrees
  throttle: number;     // percent
  alt: number;          // meters
  climb: number;        // m/s
}

export interface GpsRawData {
  fixType: number;
  lat: number;
  lon: number;
  alt: number;
  satellites: number;
}

export interface CommandAckData {
  command: number;
  result: number;
}

/** Parse a raw MAVLink v1 packet from bytes */
export function parsePacket(data: Uint8Array): MavlinkMessage | null {
  if (data.length < 8) return null;
  if (data[0] !== MAVLINK_START) return null;

  const payloadLen = data[1]!;
  const expectedLen = 6 + payloadLen + 2;
  if (data.length < expectedLen) return null;

  const sequence = data[2]!;
  const systemId = data[3]!;
  const componentId = data[4]!;
  const msgId = data[5]!;

  const payloadBytes = data.slice(6, 6 + payloadLen);

  return {
    msgId,
    systemId,
    componentId,
    sequence,
    payload: new DataView(payloadBytes.buffer, payloadBytes.byteOffset, payloadBytes.byteLength),
  };
}

export function decodeHeartbeat(msg: MavlinkMessage): HeartbeatData {
  const p = msg.payload;
  return {
    customMode: p.getUint32(0, true),
    type: p.getUint8(4),
    autopilot: p.getUint8(5),
    baseMode: p.getUint8(6),
    systemStatus: p.getUint8(7),
    isArmed: (p.getUint8(6) & MAV_MODE_FLAG.SAFETY_ARMED) !== 0,
  };
}

export function decodeGlobalPosition(msg: MavlinkMessage): GlobalPositionData {
  const p = msg.payload;
  return {
    lat: p.getInt32(4, true) / 1e7,
    lon: p.getInt32(8, true) / 1e7,
    alt: p.getInt32(12, true) / 1000,
    relativeAlt: p.getInt32(16, true) / 1000,
    heading: p.getUint16(24, true) / 100,
    vx: p.getInt16(20, true) / 100,
    vy: p.getInt16(22, true) / 100,
    vz: 0,
  };
}

export function decodeSysStatus(msg: MavlinkMessage): SysStatusData {
  const p = msg.payload;
  return {
    batteryVoltage: p.getUint16(14, true) / 1000,
    batteryCurrent: p.getInt16(16, true) / 100,
    batteryRemaining: p.getInt8(30),
  };
}

export function decodeVfrHud(msg: MavlinkMessage): VfrHudData {
  const p = msg.payload;
  return {
    airspeed: p.getFloat32(0, true),
    groundspeed: p.getFloat32(4, true),
    alt: p.getFloat32(8, true),
    climb: p.getFloat32(12, true),
    heading: p.getInt16(16, true),
    throttle: p.getUint16(18, true),
  };
}

export function decodeGpsRaw(msg: MavlinkMessage): GpsRawData {
  const p = msg.payload;
  return {
    fixType: p.getUint8(28),
    lat: p.getInt32(8, true) / 1e7,
    lon: p.getInt32(12, true) / 1e7,
    alt: p.getInt32(16, true) / 1000,
    satellites: p.getUint8(29),
  };
}

export function decodeCommandAck(msg: MavlinkMessage): CommandAckData {
  const p = msg.payload;
  return {
    command: p.getUint16(0, true),
    result: p.getUint8(2),
  };
}
