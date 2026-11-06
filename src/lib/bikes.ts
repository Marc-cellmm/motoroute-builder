import type { FuelKind } from './types';

export interface BikeModel {
  id: string;
  make: string;
  model: string;
  years: string;
  category: string;
  tankLiters: number;
  reserveLiters: number;
  consumption: number; // l/100 km
  fuel: FuelKind;
  verified: boolean; // true = comprovat amb la fitxa oficial del fabricant
}

/**
 * Catàleg inicial. Només la INT650 està verificada amb la fitxa oficial; la resta
 * són valors aproximats que l'usuari ha de revisar. En producció aquest catàleg
 * ve de la taula `motorcycle_models` (secció 8.5 del document de disseny).
 */
export const BIKE_CATALOG: BikeModel[] = [
  { id: 're-int650', make: 'Royal Enfield', model: 'Interceptor 650', years: '2018–', category: 'naked', tankLiters: 13.7, reserveLiters: 2.9, consumption: 4.21, fuel: 'gasoline_95', verified: true },
  { id: 'yamaha-mt07', make: 'Yamaha', model: 'MT-07', years: '2021–', category: 'naked', tankLiters: 14, reserveLiters: 3, consumption: 4.2, fuel: 'gasoline_95', verified: false },
  { id: 'yamaha-t7', make: 'Yamaha', model: 'Ténéré 700', years: '2019–', category: 'adventure', tankLiters: 16, reserveLiters: 3.5, consumption: 4.3, fuel: 'gasoline_95', verified: false },
  { id: 'yamaha-tracer9', make: 'Yamaha', model: 'Tracer 9', years: '2021–', category: 'touring', tankLiters: 18, reserveLiters: 3.5, consumption: 5.0, fuel: 'gasoline_95', verified: false },
  { id: 'yamaha-xmax300', make: 'Yamaha', model: 'XMAX 300', years: '2017–', category: 'scooter', tankLiters: 13, reserveLiters: 2.5, consumption: 3.0, fuel: 'gasoline_95', verified: false },
  { id: 'honda-at', make: 'Honda', model: 'CRF1100L Africa Twin', years: '2020–', category: 'adventure', tankLiters: 18.8, reserveLiters: 4, consumption: 4.9, fuel: 'gasoline_95', verified: false },
  { id: 'honda-nx500', make: 'Honda', model: 'NX500 / CB500X', years: '2019–', category: 'adventure', tankLiters: 17.5, reserveLiters: 3.5, consumption: 3.6, fuel: 'gasoline_95', verified: false },
  { id: 'honda-cb650r', make: 'Honda', model: 'CB650R', years: '2019–', category: 'naked', tankLiters: 15.4, reserveLiters: 3.5, consumption: 4.9, fuel: 'gasoline_95', verified: false },
  { id: 'honda-forza350', make: 'Honda', model: 'Forza 350', years: '2021–', category: 'scooter', tankLiters: 11.7, reserveLiters: 2.5, consumption: 3.1, fuel: 'gasoline_95', verified: false },
  { id: 'bmw-r1250gs', make: 'BMW', model: 'R 1250 GS', years: '2019–2023', category: 'adventure', tankLiters: 20, reserveLiters: 4, consumption: 4.8, fuel: 'gasoline_95', verified: false },
  { id: 'bmw-r1300gs', make: 'BMW', model: 'R 1300 GS', years: '2024–', category: 'adventure', tankLiters: 19, reserveLiters: 4, consumption: 4.8, fuel: 'gasoline_95', verified: false },
  { id: 'bmw-f900gs', make: 'BMW', model: 'F 900 GS', years: '2024–', category: 'adventure', tankLiters: 14.5, reserveLiters: 3.5, consumption: 4.3, fuel: 'gasoline_95', verified: false },
  { id: 'ktm-390adv', make: 'KTM', model: '390 Adventure', years: '2020–', category: 'adventure', tankLiters: 14.5, reserveLiters: 2.5, consumption: 3.5, fuel: 'gasoline_95', verified: false },
  { id: 'ktm-890adv', make: 'KTM', model: '890 Adventure', years: '2021–', category: 'adventure', tankLiters: 20, reserveLiters: 4, consumption: 4.5, fuel: 'gasoline_95', verified: false },
  { id: 'kawasaki-z900', make: 'Kawasaki', model: 'Z900', years: '2017–', category: 'naked', tankLiters: 17, reserveLiters: 3.5, consumption: 5.5, fuel: 'gasoline_95', verified: false },
  { id: 'kawasaki-versys650', make: 'Kawasaki', model: 'Versys 650', years: '2015–', category: 'touring', tankLiters: 21, reserveLiters: 4, consumption: 4.6, fuel: 'gasoline_95', verified: false },
  { id: 'triumph-tiger900', make: 'Triumph', model: 'Tiger 900', years: '2020–', category: 'adventure', tankLiters: 20, reserveLiters: 4, consumption: 5.0, fuel: 'gasoline_95', verified: false },
  { id: 'suzuki-vstrom800', make: 'Suzuki', model: 'V-Strom 800DE', years: '2023–', category: 'adventure', tankLiters: 20, reserveLiters: 4, consumption: 4.4, fuel: 'gasoline_95', verified: false },
  { id: 'ducati-mts-v4', make: 'Ducati', model: 'Multistrada V4', years: '2021–', category: 'touring', tankLiters: 22, reserveLiters: 4, consumption: 6.5, fuel: 'gasoline_98', verified: false },
  { id: 'ducati-monster', make: 'Ducati', model: 'Monster', years: '2021–', category: 'naked', tankLiters: 14, reserveLiters: 3, consumption: 5.3, fuel: 'gasoline_98', verified: false },
];

export function searchCatalog(q: string): BikeModel[] {
  const t = q.trim().toLowerCase();
  if (!t) return BIKE_CATALOG;
  return BIKE_CATALOG.filter((b) => `${b.make} ${b.model}`.toLowerCase().includes(t));
}

export const CATEGORY_LABEL: Record<string, string> = {
  naked: 'Naked',
  sport: 'Esportiva',
  touring: 'Turisme',
  adventure: 'Trail / Adventure',
  trail: 'Trail',
  enduro: 'Enduro',
  custom: 'Custom',
  scooter: 'Scooter',
};
