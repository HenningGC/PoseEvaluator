export enum ExerciseType {
  PUSHUP = 'PUSHUP',
  SQUAT = 'SQUAT',
  PLANK = 'PLANK',
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseResult {
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
}

export interface ExerciseState {
  count: number;
  feedback: string;
  isCorrectForm: boolean;
  stage: 'UP' | 'DOWN' | 'NEUTRAL';
  timer?: number; // For plank
  visibilityIssue?: boolean; // True if pose is not visible enough
  landmarksNeedingImprovement?: number[]; // Indices of landmarks with form issues
}

export type ExerciseProcessor = (landmarks: Landmark[], currentState: ExerciseState) => ExerciseState;
