// TWA brief step 2: Digital Asset Links. The file ships with no fingerprint until a real certificate exists;
// twa/scripts/fingerprint.mjs adds the upload key (Phase A) and the Play App Signing key (Phase B).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FINGERPRINT_RE, RELATION, addFingerprint, normalizeFingerprint, parseKeytool } from '../../twa/scripts/fingerprint.mjs';

type Statement = { relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } };

const statements = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8')) as Statement[];
const pkg = (JSON.parse(readFileSync('twa/twa-manifest.json', 'utf8')) as { packageId: string }).packageId;
const FP = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89';

describe('public/.well-known/assetlinks.json', () => {
  it('has exactly one statement, for the twa-manifest package, with the handle_all_urls relation', () => {
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatchObject({ relation: [RELATION], target: { namespace: 'android_app', package_name: pkg } });
    expect(pkg).toBe('com.docttak.app');
  });

  it('lists only well-formed, unique SHA-256 fingerprints (uppercase colon-hex)', () => {
    const fps = statements[0]!.target.sha256_cert_fingerprints;
    expect(Array.isArray(fps)).toBe(true);
    for (const fp of fps) expect(fp).toMatch(FINGERPRINT_RE);
    expect(new Set(fps).size).toBe(fps.length);
  });

  it('public/_headers serves it as JSON with a 1-hour cache', () => {
    const headers = readFileSync('public/_headers', 'utf8').replace(/\r\n/g, '\n');
    expect(headers).toMatch(/^\/\.well-known\/assetlinks\.json\n {2}Content-Type: application\/json\n {2}Cache-Control: public, max-age=3600$/m);
  });
});

describe('twa/scripts/fingerprint.mjs', () => {
  it('normalizes lowercase and colon-less input; rejects anything that is not 32 bytes of hex', () => {
    expect(normalizeFingerprint(FP.toLowerCase())).toBe(FP);
    expect(normalizeFingerprint(FP.replace(/:/g, ''))).toBe(FP);
    expect(() => normalizeFingerprint('<UPLOAD_SHA256>')).toThrow();
    expect(() => normalizeFingerprint(FP.slice(3))).toThrow();
    expect(() => normalizeFingerprint('')).toThrow();
  });

  it('reads the SHA-256 line of keytool -list -v output (not SHA1)', () => {
    const out = `Alias name: upload\nCertificate fingerprints:\n\t SHA1: 11:22:33:44:55:66:77:88:99:00:11:22:33:44:55:66:77:88:99:00\n\t SHA256: ${FP.toLowerCase()}\nSignature algorithm name: SHA256withRSA\n`;
    expect(parseKeytool(out)).toBe(FP);
    expect(() => parseKeytool('Alias name: upload\n')).toThrow();
  });

  it('adds to the package statement without duplicates and without mutating the input', () => {
    const once = addFingerprint(statements, pkg, FP);
    expect(once[0]!.target.sha256_cert_fingerprints).toContain(FP);
    expect(addFingerprint(once, pkg, FP.toLowerCase())).toEqual(once);
    expect(statements[0]!.target.sha256_cert_fingerprints).not.toContain(FP);
    const fresh = addFingerprint([], pkg, FP);
    expect(fresh).toEqual([{ relation: [RELATION], target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: [FP] } }]);
  });
});
