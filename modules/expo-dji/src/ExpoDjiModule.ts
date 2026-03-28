import { NativeModule, requireNativeModule } from 'expo';
import { ExpoDjiModuleEvents } from './ExpoDji.types';

declare class ExpoDjiModule extends NativeModule<ExpoDjiModuleEvents> {
  isAvailable(): boolean;
  registerSDK(): Promise<{ success: boolean; message: string }>;
  connect(): Promise<{ success: boolean; message: string }>;
  disconnect(): Promise<{ success: boolean; message: string }>;
  takeoff(altitude: number): Promise<{ success: boolean; message: string }>;
  land(): Promise<{ success: boolean; message: string }>;
  hover(): Promise<{ success: boolean; message: string }>;
  returnHome(): Promise<{ success: boolean; message: string }>;
  emergencyStop(): void;
  capturePhoto(): Promise<{ success: boolean; message: string; uri: string; timestamp: string }>;
  startVideo(): Promise<{ success: boolean; message: string }>;
  stopVideo(): Promise<{ success: boolean; message: string }>;
  moveRelative(fwd: number, right: number, up: number): Promise<{ success: boolean; message: string }>;
  setHeading(deg: number): Promise<{ success: boolean; message: string }>;
  setAltitude(alt: number): Promise<{ success: boolean; message: string }>;
  goToGPS(lat: number, lon: number, alt: number): Promise<{ success: boolean; message: string }>;
  getObstacleData(): Promise<{ supported: boolean }>;
}

export default requireNativeModule<ExpoDjiModule>('ExpoDji');
