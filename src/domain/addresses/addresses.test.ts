import { describe, expect, it } from 'vitest';
import { appleMapsUrl, destination, geoUrl, googleMapsUrl, navigationUrl } from './links';
import { editDistance, foldWords, searchAddresses } from './search';

const place = (name: string, street: string, extra: { city?: string; apartment?: string; doorCode?: string } = {}) => ({
  name,
  street,
  city: extra.city ?? 'Tel Aviv',
  apartment: extra.apartment,
  doorCode: extra.doorCode,
});

describe('navigation links', () => {
  const herzl = place('Grandma', ' Herzl 12 ', { city: 'Tel Aviv', apartment: '4', doorCode: '1234#' });
  const hebrew = place('סבתא', 'הרצל 12', { city: 'תל אביב', apartment: '7', doorCode: '9876' });

  it('asks for the street and city only', () => {
    expect(destination(herzl)).toBe('Herzl 12, Tel Aviv');
    expect(destination(hebrew)).toBe('הרצל 12, תל אביב');
  });

  it('builds geo:, Apple Maps and Google Maps links, encoded', () => {
    expect(geoUrl(herzl)).toBe('geo:0,0?q=Herzl%2012%2C%20Tel%20Aviv');
    expect(appleMapsUrl(herzl)).toBe('https://maps.apple.com/?daddr=Herzl%2012%2C%20Tel%20Aviv');
    expect(googleMapsUrl(herzl)).toBe('https://www.google.com/maps/dir/?api=1&destination=Herzl%2012%2C%20Tel%20Aviv');
    expect(decodeURIComponent(geoUrl(hebrew).slice('geo:0,0?q='.length))).toBe('הרצל 12, תל אביב');
    expect(new URL(appleMapsUrl(hebrew)).searchParams.get('daddr')).toBe('הרצל 12, תל אביב');
    expect(new URL(googleMapsUrl(hebrew)).searchParams.get('destination')).toBe('הרצל 12, תל אביב');
    for (const url of [geoUrl(hebrew), appleMapsUrl(hebrew), googleMapsUrl(hebrew)]) expect(url).not.toMatch(/[א-ת ]/);
  });

  it("picks the device's own route: the system chooser on Android, Apple Maps on iOS, Google Maps elsewhere", () => {
    expect(navigationUrl(herzl, 'android')).toBe(geoUrl(herzl));
    expect(navigationUrl(herzl, 'ios')).toBe(appleMapsUrl(herzl));
    expect(navigationUrl(herzl, 'other')).toBe(googleMapsUrl(herzl));
  });

  it('never puts the apartment or door code in a link', () => {
    for (const address of [herzl, hebrew]) {
      for (const url of [geoUrl(address), appleMapsUrl(address), googleMapsUrl(address)]) {
        const decoded = decodeURIComponent(url);
        expect(decoded).not.toContain(address.doorCode);
        expect(decoded).not.toContain(`, ${address.apartment}`);
        expect(decoded).not.toMatch(/apartment|door/i);
      }
    }
    expect(decodeURIComponent(geoUrl(herzl))).not.toContain('#');
  });
});

describe('foldWords', () => {
  it('drops niqqud, accents, the geresh and final letters, and splits on marks', () => {
    expect(foldWords('שָׁלוֹם')).toEqual(['שלומ']);
    expect(foldWords('Café-Noir')).toEqual(['cafe', 'noir']);
    expect(foldWords("צ׳רצ'יל")).toEqual(foldWords("צ'רצ'יל"));
    expect(foldWords('תל־אביב')).toEqual(['תל', 'אביב']);
    expect(foldWords('  ')).toEqual([]);
  });
});

describe('editDistance', () => {
  it('counts a swap of neighbours as one edit, and gives up past the limit', () => {
    expect(editDistance('herzl', 'herzel', 2)).toBe(1);
    expect(editDistance('hrezl', 'herzl', 2)).toBe(1);
    expect(editDistance('abcdef', 'uvwxyz', 1)).toBe(2);
  });
});

describe('searchAddresses', () => {
  const book = [
    place("Dana's house", 'Ben Yehuda 5'),
    place('Grandma', 'Herzl 12'),
    place('Dentist', 'Weizmann 14', { city: 'Kfar Saba', apartment: 'Dana', doorCode: 'herzl' }),
    place('שלום ורינה', 'רחוב הגפן 3'),
    place('Office', 'Dizengoff 50'),
    place('Herzl gym', 'Arlozorov 2'),
  ];
  const names = (query: string): string[] => searchAddresses(book, query, 'en').map((row) => row.name);

  it('finds by prefix', () => {
    expect(names('dan')).toEqual(["Dana's house"]);
  });

  it('forgives a typo', () => {
    expect(names('herzel')).toEqual(['Herzl gym', 'Grandma']);
    expect(names('Grandmma')).toEqual(['Grandma']);
  });

  it('reads Hebrew with vowel points, and a final letter typed mid-word', () => {
    expect(names('שָׁלוֹם')).toEqual(['שלום ורינה']);
    expect(names('שלומ')).toEqual(['שלום ורינה']);
    expect(names('הגפ')).toEqual(['שלום ורינה']);
  });

  it('needs every query word to match', () => {
    expect(names('grandma herzl')).toEqual(['Grandma']);
    expect(names('grandma dizengoff')).toEqual([]);
  });

  it('finds by city, typos included', () => {
    expect(names('kfar saba')).toEqual(['Dentist']);
    expect(names('kfar sabba')).toEqual(['Dentist']);
    expect(names('tel aviv')).toHaveLength(5);
  });

  it('never matches the apartment or door code', () => {
    expect(names('herzl')).not.toContain('Dentist');
    expect(names('dana')).not.toContain('Dentist');
  });

  it('ranks a name or street match before a city match', () => {
    const rows = [place('Office', 'Main 1', { city: 'Haifa' }), place('Haifa flat', 'Main 2', { city: 'Acre' }), place('Port', 'Haifa Road 3', { city: 'Acre' })];
    expect(searchAddresses(rows, 'haifa', 'en').map((row) => row.name)).toEqual(['Haifa flat', 'Port', 'Office']);
  });

  it('ranks exact before prefix before typo, and the name before the street', () => {
    const rows = [place('Parkside', 'Main 1'), place('Park', 'Main 2'), place('Prak', 'Main 3'), place('Home', 'Park 7')];
    expect(searchAddresses(rows, 'park', 'en').map((row) => row.name)).toEqual(['Park', 'Home', 'Parkside', 'Prak']);
    // All three are one typo away; the two matched by name come first.
    expect(searchAddresses(rows, 'parc', 'en').map((row) => row.name)).toEqual(['Park', 'Parkside', 'Home']);
  });

  it('has no typo match for short words', () => {
    expect(names('dsn')).toEqual([]);
  });

  it('returns everything by name for an empty query', () => {
    expect(names('  ')).toEqual(['Dana\'s house', 'Dentist', 'Grandma', 'Herzl gym', 'Office', 'שלום ורינה']);
  });
});
