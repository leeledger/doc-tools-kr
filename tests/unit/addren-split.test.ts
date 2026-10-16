// 영문주소 변환기 (ADDREN1016 decision 10): the field split of the official English road address and the on-device
// 상세주소 conversion. Fixtures follow the V7 (주소정보누리집 영문 표기방법) and V8 (UPU Korea) examples; A3 adds real
// addrEngApi answers.
import { describe, expect, it } from 'vitest';
import { COUNTRY, fullLine, splitRoad } from '../../src/tools/english-address/split';
import { convertDetail } from '../../src/tools/english-address/detail';
import { failCode, MANUAL, MESSAGES, messageCode } from '../../src/tools/english-address/messages';

describe('splitRoad (decision 10)', () => {
  it.each([
    ['Seoul, a gu (V7 small -> large)', { road: '110 Sejong-daero, Jung-gu, Seoul', si: 'Seoul', sgg: 'Jung-gu', zip: '04524' }, '110 Sejong-daero', 'Jung-gu', 'Seoul'],
    ['Gyeonggi, a si and a beon-gil road', { road: '7 Jungang-ro 35beon-gil, Hwaseong-si, Gyeonggi-do', si: 'Gyeonggi-do', sgg: 'Hwaseong-si', zip: '18338' }, '7 Jungang-ro 35beon-gil', 'Hwaseong-si', 'Gyeonggi-do'],
    ['Daegu (V7 example)', { road: '56 Dalgubeol-daero 323beon-gil, Suseong-gu, Daegu', si: 'Daegu', sgg: 'Suseong-gu', zip: '42250' }, '56 Dalgubeol-daero 323beon-gil', 'Suseong-gu', 'Daegu'],
    ['Chuncheon (V7 example)', { road: '42 Toegye-ro 77beon-gil, Chuncheon-si, Gangwon-do', si: 'Gangwon-do', sgg: 'Chuncheon-si', zip: '24418' }, '42 Toegye-ro 77beon-gil', 'Chuncheon-si', 'Gangwon-do'],
    ['rural eup stays on the street line (V8)', { road: '6 Jong-ro, Changnyeong-eup, Changnyeong-gun, Gyeongsangnam-do', si: 'Gyeongsangnam-do', sgg: 'Changnyeong-gun', zip: '50323' }, '6 Jong-ro, Changnyeong-eup', 'Changnyeong-gun', 'Gyeongsangnam-do'],
    ['Sejong: empty sgg, city = si', { road: '261 Dasom-ro, Sejong-si', si: 'Sejong-si', sgg: '', zip: '30116' }, '261 Dasom-ro', 'Sejong-si', 'Sejong-si'],
    ['underground building: road as returned', { road: 'B 39 Toegye-ro, Jung-gu, Seoul', si: 'Seoul', sgg: 'Jung-gu', zip: '04529' }, 'B 39 Toegye-ro', 'Jung-gu', 'Seoul'],
  ])('%s', (_, item, line1, city, state) => {
    const r = splitRoad(item);
    expect(r).toEqual({ line1, city, state, zip: item.zip, country: COUNTRY, fallback: false });
  });

  it('suffix mismatch: the text before the first whole ", {sgg}" part', () => {
    const r = splitRoad({ road: '110 Sejong-daero, Jung-gu, Seoul Special City', si: 'Seoul', sgg: 'Jung-gu', zip: '04524' });
    expect(r.line1).toBe('110 Sejong-daero');
    expect(r.fallback).toBe(false);
  });

  it('a part that only starts with sgg does not count ("Jung-gun" is not "Jung-gu")', () => {
    const r = splitRoad({ road: '1 Test-ro, Jung-gun, Somewhere', si: 'Seoul', sgg: 'Jung-gu', zip: '00000' });
    expect(r).toMatchObject({ line1: '1 Test-ro, Jung-gun, Somewhere', fallback: true });
  });

  it('sgg not found: line1 = road, fallback, rows still from the fields', () => {
    const r = splitRoad({ road: '20 Pangyo-ro, Seongnam-si Bundang-gu, Gyeonggi-do', si: 'Gyeonggi-do', sgg: 'Bundang-gu, Seongnam-si', zip: '13487' });
    expect(r).toEqual({ line1: '20 Pangyo-ro, Seongnam-si Bundang-gu, Gyeonggi-do', city: 'Bundang-gu, Seongnam-si', state: 'Gyeonggi-do', zip: '13487', country: 'South Korea', fallback: true });
  });

  it('empty road or si never throws', () => {
    expect(splitRoad({ road: '', si: '', sgg: '', zip: '' })).toMatchObject({ line1: '', fallback: true });
  });
});

describe('fullLine', () => {
  it('road + zip, with the 상세주소 first when given (V7)', () => {
    expect(fullLine('110 Sejong-daero, Jung-gu, Seoul', '04524')).toBe('110 Sejong-daero, Jung-gu, Seoul 04524');
    expect(fullLine('56 Dalgubeol-daero 323beon-gil, Suseong-gu, Daegu', '42250', '705-dong 1104-ho')).toBe('705-dong 1104-ho, 56 Dalgubeol-daero 323beon-gil, Suseong-gu, Daegu 42250');
  });
});

describe('convertDetail (on the device; decision 10)', () => {
  it.each([
    ['101동 1203호', '101-dong 1203-ho'],
    ['705동1104호', '705-dong 1104-ho'],
    ['101 동 1203 호', '101-dong 1203-ho'],
    ['3층', '3F'],
    ['지하1층', 'B1F'],
    ['지하 2층 101호', 'B2F 101-ho'],
    ['지하 3호', 'B3-ho'],
    ['지하3호', 'B3-ho'],
    ['705-1104', '705-1104'],
    ['Apt 3, 101동', 'Apt 3, 101-dong'],
    ['1203호, 101동', '1203-ho, 101-dong'],
    ['#1203', '1203'],
    ['  ', ''],
    ['', ''],
  ])('%s -> %s', (raw, line2) => {
    expect(convertDetail(raw)).toEqual({ line2, needsManual: false });
  });

  it.each(['래미안아파트 101동 1203호', '가동 101호', '101동 1203호 (반포동)', '상가 2층'])('other Hangul needs the visitor: %s', (raw) => {
    expect(convertDetail(raw)).toEqual({ line2: '', needsManual: true });
  });
});

describe('messages (decision 13) and usage codes (decision 17)', () => {
  it('maps the Function codes; unknown, engine, upstream, timeout and off share the generic line', () => {
    for (const c of ['short', 'sido', 'digits', 'long', 'chars', 'broad', 'busy', 'none', 'offline']) expect(messageCode(c)).toBe(c);
    for (const c of ['engine', 'upstream', 'timeout', 'off', 'bad', 'whatever', undefined, 3]) expect(messageCode(c)).toBe('other');
    expect(MESSAGES.other).toBe('지금은 주소를 찾을 수 없어요. 잠시 뒤에 다시 해 주세요.');
    expect(MANUAL).toContain('아파트 이름은 빼도 돼요');
  });

  it('usage fail codes', () => {
    expect(failCode('none')).toBe('no-result');
    for (const c of ['short', 'sido', 'digits', 'long', 'chars', 'broad']) expect(failCode(c)).toBe('query');
    expect(failCode('busy')).toBe('busy');
    expect(failCode('timeout')).toBe('timeout');
    for (const c of ['engine', 'upstream', 'off', 'bad', undefined]) expect(failCode(c)).toBe('engine');
    expect(failCode('offline')).toBeNull();
  });

  it('plain words only: no 서버·업로드·브라우저·네트워크·API, never 「보내지 않아요」', () => {
    for (const s of [...Object.values(MESSAGES), MANUAL]) expect(s).not.toMatch(/서버|업로드|브라우저|네트워크|API|보내지 않아요/);
  });
});
