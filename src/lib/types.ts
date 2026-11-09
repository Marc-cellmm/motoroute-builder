export type LngLat = [number, number];

export type RideMode = 'road' | 'trail';
export type Difficulty = 'beginner' | 'intermediate' | 'expert';
export type DistanceBand = '50_100' | '100_200' | '200_400' | '400_plus';
export type FuelKind = 'gasoline_95' | 'gasoline_98';

export interface Place {
  name: string;
  coord: LngLat;
}

export interface Motorcycle {
  id: string;
  name: string;
  modelId?: string;
  category: string;
  fuel: FuelKind;
  tankLiters: number;
  reserveLiters: number;
  consumptionWmtc: number; // l/100 km de fitxa
  carriesPassenger: boolean;
  carriesLuggage: boolean;
  refuels: Refuel[];
  isDefault: boolean;
}

export interface Refuel {
  date: string;
  liters: number;
  kmSinceLastFull: number | null;
  fullTank: boolean;
  pricePerLiter?: number;
}

export interface PlanRequest {
  mode: RideMode;
  difficulty: Difficulty;
  origin: Place | null;
  circular: boolean;
  destination: Place | null;
  vias: Place[];
  band: DistanceBand;
  avoidMotorways: boolean;
  avoidTolls: boolean;
  bikeId: string | null;
  startFuelFraction: number; // 1, 0.75, 0.5, 0.25
  departure: string; // ISO local datetime
  days: number;
  kmPerDay: number;
}

export interface Segment {
  kmStart: number;
  kmEnd: number;
  surface: 'paved' | 'unpaved';
  curvesPerKm: number;
  minRadius: number;
  maxGrade: number;
  difficulty: Difficulty;
}

export interface WeatherSample {
  km: number;
  coord: LngLat;
  eta: Date;
  altitude: number;
  tempC: number;
  precipProb: number;
  precipMm: number;
  gustKmh: number;
  weatherCode: number;
  freezingLevel: number | null;
  level: 0 | 1 | 2 | 3;
  reasons: string[];
}

export interface FuelStation {
  id: string;
  brand: string;
  address: string;
  town: string;
  coord: LngLat;
  hours: string;
  price95: number | null;
  price98: number | null;
}

export interface StationOnRoute extends FuelStation {
  km: number;
  offsetKm: number;
  price: number | null;
}

export interface FuelPlan {
  stations: StationOnRoute[];
  stops: (StationOnRoute & { reason: string })[];
  warnings: string[];
  liters: number;
  cost: number | null;
  safeRangeKm: number;
  consumption: number;
}

export interface Accommodation {
  id: string;
  name: string;
  kind: string;
  coord: LngLat;
  stars: number | null;
  website?: string;
  phone?: string;
  distanceKm: number;
}

export interface Stage {
  index: number;
  kmStart: number;
  kmEnd: number;
  end: LngLat;
  date: Date;
  accommodations?: Accommodation[];
}

export interface RouteResult {
  id: string;
  label: string;
  color: string;
  coords: LngLat[]; // [lng, lat]
  elevations: number[]; // alineat amb profilePoints
  profileKm: number[];
  distanceKm: number;
  durationMin: number;
  unpavedKm: number;
  motorwayKm: number;
  elevationGain: number;
  maxAltitude: number;
  curvatureScore: number; // 0-100
  difficulty: Difficulty;
  difficultyScore: number;
  segments: Segment[];
  weather?: WeatherSample[];
  bestDepartures?: { time: Date; penalty: number; note: string }[];
  fuel?: FuelPlan;
  stages?: Stage[];
}

export interface SavedRoute {
  id: string;
  title: string;
  savedAt: string;
  request: PlanRequest;
  route: Omit<RouteResult, 'weather' | 'fuel' | 'stages' | 'bestDepartures'>;
}

/** Ruta gravada amb el GPS del telèfon. */
export interface RecordedRoute {
  id: string;
  title: string;
  recordedAt: string; // ISO
  mode: RideMode;
  startName: string | null;
  movingMin: number;
  elapsedMin: number;
  avgKmh: number;
  maxKmh: number;
  route: Omit<RouteResult, 'weather' | 'fuel' | 'stages' | 'bestDepartures'>;
  gpx: string; // traçat original amb hores, per exportar
  sharedAt?: string;
}
