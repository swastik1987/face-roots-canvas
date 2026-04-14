/**
 * Pose estimation — landmark-geometry approach.
 *
 * We derive yaw / pitch / roll directly from facial landmark positions
 * rather than decomposing the facial transformation matrix.  The matrix
 * decomposition is fragile because MediaPipe's coordinate frame differs
 * from the standard ZYX Euler convention used in most references.
 *
 * Landmark indices used (standard MediaPipe 478-point model):
 *   1   — nose tip
 *   10  — forehead centre
 *   152 — chin bottom
 *   234 — left ear tragion  (user's left  = camera's right in raw video)
 *   454 — right ear tragion (user's right = camera's left  in raw video)
 *
 * Sign convention (matches Capture.tsx angle specs):
 *   yaw   > 0 → nose pointing to camera's RIGHT
 *              (user turns their head LEFT as seen in the mirrored display)
 *   yaw   < 0 → nose pointing to camera's LEFT  (user turns right in mirror)
 *   pitch > 0 → face tilted downward
 *   roll  > 0 → head tilted to the right
 *
 * Note: react-webcam's `mirrored` prop only flips the CSS display and the
 * screenshot canvas — the raw HTMLVideoElement pixel data fed to MediaPipe
 * is never mirrored.  Yaw sign therefore matches physical camera-frame
 * orientation, which aligns with the spec above when the user views a
 * mirrored preview.
 */

import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type PoseAngles = {
  yaw: number;    // degrees
  pitch: number;  // degrees
  roll: number;   // degrees
};

/**
 * Extract pose from the first detected face in a FaceLandmarkerResult.
 * Returns null if no face is present.
 */
export function extractPose(result: FaceLandmarkerResult): PoseAngles | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;
  return poseFromLandmarks(result.faceLandmarks[0]);
}

function poseFromLandmarks(
  landmarks: Array<{ x: number; y: number; z: number }>,
): PoseAngles {
  const nose     = landmarks[1];    // nose tip
  const forehead = landmarks[10];   // upper forehead
  const chin     = landmarks[152];  // chin bottom
  const leftEar  = landmarks[234];  // user's left ear  (camera's right)
  const rightEar = landmarks[454];  // user's right ear (camera's left)

  // ── Yaw ─────────────────────────────────────────────────────────────────
  //
  // When the face is front-on the nose tip sits at the horizontal midpoint
  // of the two ear-tragion landmarks.  As the face turns, the nose drifts
  // toward the leading ear:
  //
  //   (nose.x - midX) / halfFaceW  →  normalised offset in [-1, +1]
  //
  // We scale by 75 so that a pure side-profile (~halfFaceW ≈ 0) would read
  // as ±75°, which is a reasonable upper bound for detectable rotation.
  const midX      = (leftEar.x + rightEar.x) / 2;
  const halfFaceW = Math.abs(rightEar.x - leftEar.x) / 2;

  const yaw = halfFaceW > 0.02
    ? Math.max(-85, Math.min(85, ((nose.x - midX) / halfFaceW) * 75))
    : (nose.x > 0.5 ? 75 : -75);   // extreme profile — pick a sign

  // ── Pitch ────────────────────────────────────────────────────────────────
  //
  // The nose should sit at the vertical midpoint of forehead↔chin when the
  // head is level.  Downward tilt moves the nose toward the chin (higher y),
  // giving a positive pitch.
  const midY      = (forehead.y + chin.y) / 2;
  const halfFaceH = Math.abs(chin.y - forehead.y) / 2;

  const pitch = halfFaceH > 0.02
    ? Math.max(-60, Math.min(60, ((nose.y - midY) / halfFaceH) * 45))
    : 0;

  // ── Roll ─────────────────────────────────────────────────────────────────
  const roll = Math.atan2(
    leftEar.y - rightEar.y,
    leftEar.x - rightEar.x,
  ) * (180 / Math.PI);

  return { yaw, pitch, roll };
}
