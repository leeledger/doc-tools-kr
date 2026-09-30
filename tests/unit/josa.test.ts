// Korean particle choice (Polish Q, UX-AUDIT-2 P1-6).
import { describe, expect, it } from 'vitest';
import { finalSound, josa, particle } from '../../src/lib/ui/josa';

describe('josa', () => {
  it('Hangul: 받침, no 받침, and ㄹ for 으로/로', () => {
    expect(josa('사진', '은/는')).toBe('사진은');
    expect(josa('파일', '은/는')).toBe('파일은');
    expect(josa('문서', '은/는')).toBe('문서는');
    expect(josa('문서딱', '은/는')).toBe('문서딱은');
    expect(josa('문서딱', '으로/로')).toBe('문서딱으로');
    expect(josa('파일', '으로/로')).toBe('파일로');
    expect(josa('사진', '으로/로')).toBe('사진으로');
    expect(josa('문서', '으로/로')).toBe('문서로');
    expect(josa('사진', '이/가')).toBe('사진이');
    expect(josa('문서', '을/를')).toBe('문서를');
    expect(josa('사진', '과/와')).toBe('사진과');
  });

  it('numbers are read aloud: 1518 → 팔 → 로; 2025×1518; units by their tail', () => {
    expect(josa('2025×1518', '으로/로')).toBe('2025×1518로');
    expect(josa('413×531', '으로/로')).toBe('413×531로');
    expect(josa('640×800', '으로/로')).toBe('640×800으로');
    expect(josa('1,000쪽', '이/가')).toBe('1,000쪽이');
    expect(josa('3', '은/는')).toBe('3은');
    expect(josa('2', '은/는')).toBe('2는');
    expect(josa('6', '으로/로')).toBe('6으로');
    expect(josa('7', '으로/로')).toBe('7로');
    expect(josa('10', '은/는')).toBe('10은');
    expect(josa('1.5', '이/가')).toBe('1.5가');
    expect(josa('150 MB', '을/를')).toBe('150 MB를');
    expect(josa('5,000만 화소(50 MP)', '이/가')).toBe('5,000만 화소(50 MP)가');
  });

  it('file names: the Korean letter name of the last letter; closing marks are skipped', () => {
    expect(josa('notes.txt', '은/는')).toBe('notes.txt는');
    expect(josa('scan.pdf', '을/를')).toBe('scan.pdf를');
    expect(josa('사진.jpg', '을/를')).toBe('사진.jpg를');
    expect(josa('form.html', '은/는')).toBe('form.html은');
    expect(josa('photo.jpeg', '은/는')).toBe('photo.jpeg는');
    expect(josa('제출서류.hwp', '이/가')).toBe('제출서류.hwp가');
    expect(josa('a.m', '으로/로')).toBe('a.m으로');
    expect(josa('a.r', '으로/로')).toBe('a.r로');
    expect(josa('「이력서」', '은/는')).toBe('「이력서」는');
    expect(josa('이력서 (최종)', '을/를')).toBe('이력서 (최종)을');
    expect(particle('', '은/는')).toBe('는');
    expect(finalSound('ㅋ')).toBe('none');
  });
});
