declare module 'geoip-lite' {
  export interface Lookup {
    range: [number, number];
    country: string;
    region: string;
    city: string;
    ll: [number, number];
    metro: number;
    area: number;
    eu: string;
    timezone: string;
  }

  export function lookup(ip: string): Lookup | null;

  const geoip: {
    lookup: typeof lookup;
  };

  export default geoip;
}
