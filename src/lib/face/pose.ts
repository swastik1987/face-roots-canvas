/**
 * Pose estimation helpers.
 * Extracts yaw / pitch / roll from a MediaPipe FaceLandmarker result
 * using the facial transformation matrix when available, or landmark
 * geometry as a fallback.
 */

import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type PoseAngles = {
  yaw: number;    // degrees, + = face turned right (from camera)
  pitch: number;  // degrees, + = face tilted down
  roll: number;   // degrees, + = face tilted right
};

/**
 * Extract pose from the first detected face in a FaceLandmarkerResult.
 * Returns null if no face is present.
 */
export function extractPose(result: FaceLandmarkerResult): PoseAngles | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

  // MediaPipe provides the facial transformation matrix in facialTransformationMatrixes
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (matrix && matrix.length === 16) {
    return poseFromMatrix(matrix);
  }

  // Fallback: estimate from key landmark positions
  return poseFromLandmarks(result.faceLandmarks[0]);
}

/**
 * Decompose yaw/pitch/roll from a 4×4 column-major transformation matrix.
 */
function poseFromMatrix(m: Float32Array | number[]): PoseAngles {
  // Row-major extraction: r[row][col] = m[col*4 + row]
  const r10 = m[1], r11 = m[5], r12 = m[9];
  const r00 = m[0], r20 = m[2];
  const r21 = m[6], r22 = m[10];

  const pitch = Math.atan2(-r12, Math.sqrt(r10 * r10 + r11 * r11));
  const yaw   = Math.atan2(r20, r22);
  const roll  = Math.atan2(r10, r11);

  return {
    yaw:   toDeg(yaw),
    pitch: toDeg(pitch),
    roll:  toDeg(roll),
  };
}

/**
 * Rough geometric estimate from nose tip + eye positions when the
 * transformation matrix is unavailable.
 */
function poseFromLandmarks(
  landmarks: Array<{ x: number; y: number; z: number }>,
): PoseAngles {
  const nose   = landmarks[1];   // nose tip
  const leftEye  = landmarks[33];  // left eye inner corner
  const rightEye = landmarks[263]; // right eye inner corner
  const chin   = landmarks[152]; // chin

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeMidY = (leftEye.y + rightEye.y) / 2;

  // Yaw: horizontal offset of nose from eye midpoint (rough)
  const yaw = (nose.x - eyeMidX) * 180;

  // Pitch: vertical offset of nose from eye–chin midpoint
  const vertMid = (eyeMidY + chin.y) / 2;
  const pitch = (nose.y - vertMid) * 90;

  // Roll: tilt of the eye line
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);

  return { yaw, pitch, roll };
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
