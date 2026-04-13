/**
 * Canonical MediaPipe FaceMesh 478-landmark region index sets.
 * Source: §6.2 of CLAUDE.md.
 *
 * Usage:
 *   import { FACE_REGIONS, FEATURE_TYPES } from '@/lib/face/regions';
 */

export type FeatureType =
  | 'eyes_left'
  | 'eyes_right'
  | 'nose'
  | 'mouth'
  | 'jawline'
  | 'forehead'
  | 'eyebrows_left'
  | 'eyebrows_right'
  | 'ear_left'
  | 'ear_right'
  | 'hairline'
  | 'face_shape';

export const FACE_REGIONS: Record<FeatureType, number[] | 'convex_hull'> = {
  eyes_left:      [33, 133, 157, 158, 159, 160, 161, 173, 246, 7, 163, 144, 145, 153, 154, 155],
  eyes_right:     [362, 263, 384, 385, 386, 387, 388, 398, 466, 249, 390, 373, 374, 380, 381, 382],
  nose:           [1, 2, 5, 4, 6, 19, 94, 168, 197, 195, 5, 4, 45, 275],
  mouth:          [61, 291, 78, 308, 13, 14, 17, 0, 37, 267, 269, 270, 409, 291],
  jawline:        [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  forehead:       [10, 67, 109, 108, 151, 337, 338, 297, 299],
  eyebrows_left:  [46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
  eyebrows_right: [276, 283, 282, 295, 285, 300, 293, 334, 296, 336],
  ear_left:       [234, 93, 132, 58],    // side profile only
  ear_right:      [454, 323, 361, 288],  // side profile only
  hairline:       [10, 109, 67, 103, 54],
  face_shape:     'convex_hull',
};

/** Features used in the front-angle embedding pipeline */
export const FRONT_FEATURES: FeatureType[] = [
  'eyes_left', 'eyes_right', 'nose', 'mouth',
  'jawline', 'forehead', 'eyebrows_left', 'eyebrows_right', 'face_shape',
];

/** Features added when a side profile is available */
export const SIDE_FEATURES: FeatureType[] = ['ear_left', 'ear_right'];

/** Crop output size in pixels (square) */
export const CROP_SIZE = 224;

/** Padding ratio added around the bounding box before cropping */
export const CROP_PAD = 0.15;
