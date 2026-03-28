export type TelemetryEvent = {
  altitude: number;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  satellites: number;
  isFlying: boolean;
  isMotorsOn: boolean;
};

export type ConnectionEvent = {
  status: 'connected' | 'disconnected';
  model: string;
};

export type ExpoDjiModuleEvents = {
  onTelemetry: (event: TelemetryEvent) => void;
  onConnection: (event: ConnectionEvent) => void;
};
