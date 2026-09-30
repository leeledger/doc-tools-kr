// The face measurement the landmarker hands to the framing and the checklist (brief Step 4 §2). Pure types:
// frame.ts and warnings.ts never import MediaPipe.

export interface Pt {
  x: number;
  y: number;
}

export interface FacePose {
  yaw: number;
  pitch: number;
  roll: number;
}

/** Blendshape scores used by the checklist (0–1). */
export interface FaceBlend {
  mouthSmileLeft?: number;
  mouthSmileRight?: number;
  jawOpen?: number;
  eyeBlinkLeft?: number;
  eyeBlinkRight?: number;
}

/** One measured face, in source px of the working bitmap (the spike's measureFace, landmarker branch). */
export interface FaceMeasure {
  /** Faces detected in the photo (the largest one is measured). */
  faces: number;
  /** Mean of the iris centres (468, 473). */
  eye: Pt;
  /** Subject's right iris (image left) and left iris (image right). */
  eyeR: Pt;
  eyeL: Pt;
  /** Landmark 152. */
  chin: Pt;
  /** Landmarks 234 and 454; the frame is centred on their midpoint. */
  cheekR: Pt;
  cheekL: Pt;
  centerX: number;
  /** Eye-line angle in degrees (y down): positive when the image-right eye is lower. */
  roll: number;
  /** 3D inter-pupil distance in px (z on the x scale; robust to yaw). */
  ipd3d: number;
  /** From the facial transformation matrix; null when absent. */
  pose: FacePose | null;
  blend: FaceBlend;
}

export type FaceResult = { faces: 0 } | FaceMeasure;

export const hasFace = (r: FaceResult | null | undefined): r is FaceMeasure => Boolean(r && r.faces > 0);
