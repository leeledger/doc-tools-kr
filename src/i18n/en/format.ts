// English number and size words for the EN catalogs (EN1). en-US digits; MB = 1,048,576 bytes, as in the tools.
import { MB, type Device } from '../../lib/ui/device';

/** "1,500". */
export const num = (n: number): string => n.toLocaleString('en-US');

/** "1 file" / "3 files". */
export const count = (n: number, one: string, many = `${one}s`): string => `${num(n)} ${n === 1 ? one : many}`;

/** "500 MB" (whole MB, as the limit messages show them). */
export const mbText = (bytes: number): string => `${num(Math.round(bytes / MB))} MB`;

/** "a phone" / "this device": where a limit applies. */
export const deviceName = (device: Device): string => (device === 'mobile' ? 'a phone' : 'this device');
