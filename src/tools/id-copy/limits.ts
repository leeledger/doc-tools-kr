// Device limits for 신분증 사본 만들기 (TOOLS1015 I1): the 사진 JPG 변환 single-photo numbers (phone 50 MB, PC 100 MB) and
// its canvas caps. The photo is decoded at most DECODE_EDGE on its long side (a card photo needs no more; never enlarged).
import type { CanvasCaps } from '../../lib/image/caps';
import { LIMITS as IMG_JPG_LIMITS } from '../image-to-jpg/limits';
import type { Device } from '../../lib/ui/device';

export interface DeviceLimits {
  maxFileBytes: number;
  caps: CanvasCaps;
}

export const LIMITS: Record<Device, DeviceLimits> = {
  desktop: { maxFileBytes: IMG_JPG_LIMITS.desktop.maxFileBytes, caps: IMG_JPG_LIMITS.desktop.caps },
  mobile: { maxFileBytes: IMG_JPG_LIMITS.mobile.maxFileBytes, caps: IMG_JPG_LIMITS.mobile.caps },
};

/** Long edge of the decoded photo, at most. */
export const DECODE_EDGE = 2000;
/** JPEG quality of the copy. */
export const JPEG_QUALITY = 0.9;
