import { ExerciseState, Landmark } from '../types';
import { calculateAngle, POSE_LANDMARKS } from './geometry';

export const processPushup = (landmarks: Landmark[], state: ExerciseState): ExerciseState => {
  // Landmarks for arms
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
  const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
  
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];
  const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];

  // Landmarks for legs (to check if straight)
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];

  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  let newState = { ...state };

  // Check visibility of knees
  const VISIBILITY_THRESH = 0.5;
  const isLeftKneeVisible = leftKnee.visibility !== undefined && leftKnee.visibility > VISIBILITY_THRESH;
  const isRightKneeVisible = rightKnee.visibility !== undefined && rightKnee.visibility > VISIBILITY_THRESH;

  // Allow if AT LEAST ONE knee is visible (supports side view)
  if (!isLeftKneeVisible && !isRightKneeVisible) {
      newState.feedback = "Knees must be visible";
      newState.isCorrectForm = false;
      newState.visibilityIssue = true;
      newState.landmarksNeedingImprovement = [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.RIGHT_KNEE];
      return newState;
  }

  // Calculate Arm Angles (Elbows)
  const leftArmAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
  const rightArmAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
  const elbowAngle = (leftArmAngle + rightArmAngle) / 2;

  // Calculate Leg Angles (Knees) - Prioritize visible side
  let kneeAngle = 0;
  if (isLeftKneeVisible && isRightKneeVisible) {
      const leftLegAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
      const rightLegAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
      kneeAngle = (leftLegAngle + rightLegAngle) / 2;
  } else if (isLeftKneeVisible) {
      kneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  } else {
      kneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
  }

  // Defined Thresholds
  const UP_THRESH = 145.0;
  const DOWN_THRESH = 70.0;
  const LEG_EXTENDED_THRESH = 130.0;

  // 1. Form Check: Legs should be extended
  if (kneeAngle < LEG_EXTENDED_THRESH) {
    newState.feedback = "Straighten Legs";
    newState.isCorrectForm = false;
    newState.visibilityIssue = false;
    newState.landmarksNeedingImprovement = [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP];
    return newState;
  }
  
  // If legs are straight, form is considered correct for now
  newState.isCorrectForm = true;
  newState.visibilityIssue = false;
  newState.landmarksNeedingImprovement = [];

  // 2. Rep Counting Logic
  if (elbowAngle >= UP_THRESH) {
    // Top position
    if (state.stage === 'DOWN') {
      newState.count = state.count + 1;
      newState.stage = 'UP';
      newState.feedback = "Nice Rep!";
    } else {
      newState.stage = 'UP';
      newState.feedback = "Go Down";
    }
  } else if (elbowAngle <= DOWN_THRESH) {
    // Bottom position
    newState.stage = 'DOWN';
    newState.feedback = "Push Up";
  } else {
    // In transition
    if (state.stage === 'UP') {
        newState.feedback = "Lowering...";
    } else if (state.stage === 'DOWN') {
        newState.feedback = "Pushing...";
    } else {
        newState.feedback = "Get Ready";
    }
  }

  return newState;
};

export const processSquat = (landmarks: Landmark[], state: ExerciseState): ExerciseState => {
  const VISIBILITY_THRESH = 0.5;

  // Key Landmarks
  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
  const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];

  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

  // Gate: Check visibility of Hip and Knee (excluding feet/head as requested)
  const isLeftVisible = (leftHip.visibility || 0) > VISIBILITY_THRESH && (leftKnee.visibility || 0) > VISIBILITY_THRESH;
  const isRightVisible = (rightHip.visibility || 0) > VISIBILITY_THRESH && (rightKnee.visibility || 0) > VISIBILITY_THRESH;

  let newState = { ...state };

  if (!isLeftVisible && !isRightVisible) {
    newState.feedback = "Full body visible?";
    newState.isCorrectForm = false;
    newState.visibilityIssue = true;
    newState.landmarksNeedingImprovement = [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.RIGHT_KNEE];
    return newState;
  }

  let kneeAngle = 0;
  let hipAngle = 180;
  let checkLean = false;

  // Determine View Mode
  if (isLeftVisible && isRightVisible) {
    // FRONT VIEW (or both legs visible)
    // Average the knee angle
    const leftLegAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightLegAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    kneeAngle = (leftLegAngle + rightLegAngle) / 2;
    
    // In front view, measuring forward torso lean via 2D shoulder-hip-knee angle is unreliable
    // so we skip the strict lean check or assume it's fine if visible.
    checkLean = false;
  } else if (isLeftVisible) {
    // LEFT SIDE VIEW
    kneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    hipAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    checkLean = true;
  } else {
    // RIGHT SIDE VIEW
    kneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    hipAngle = calculateAngle(rightShoulder, rightHip, rightKnee);
    checkLean = true;
  }

  // Thresholds
  const UP_THRESH = 165.0;    // Standing
  const DOWN_THRESH = 95.0;   // Bottom
  const TORSO_LEAN_MAX = 55.0; // Lean limit

  // Form Check: Torso Lean (Only applicable in side view)
  if (checkLean && hipAngle < TORSO_LEAN_MAX) {
    newState.feedback = "Keep Chest Up";
    newState.isCorrectForm = false;
    newState.visibilityIssue = false;
    newState.landmarksNeedingImprovement = [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP];
    return newState;
  }

  // If form passes check
  newState.isCorrectForm = true;
  newState.visibilityIssue = false;
  newState.landmarksNeedingImprovement = [];

  // Rep Counting
  if (kneeAngle >= UP_THRESH) {
    if (state.stage === 'DOWN') {
      newState.count = state.count + 1;
      newState.stage = 'UP';
      newState.feedback = "Good Squat!";
    } else {
      newState.stage = 'UP';
      newState.feedback = "Squat Down";
    }
  } else if (kneeAngle <= DOWN_THRESH) {
    newState.stage = 'DOWN';
    newState.feedback = "Stand Up";
  } else {
    // Intermediate states
    if (state.stage === 'UP') {
      newState.feedback = "Lowering...";
    } else if (state.stage === 'DOWN') {
      newState.feedback = "Rising...";
    } else {
      newState.feedback = "Get Ready";
    }
  }

  return newState;
};

export const processPlank = (landmarks: Landmark[], state: ExerciseState): ExerciseState => {
  // For plank, we want a straight line from shoulder to hip to ankle.
  const shoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const hip = landmarks[POSE_LANDMARKS.LEFT_HIP];
  const ankle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];

  const bodyAngle = calculateAngle(shoulder, hip, ankle);
  
  let newState = { ...state };
  
  // 180 is perfectly straight. Allow some margin.
  const isStraight = bodyAngle > 165 && bodyAngle < 195;

  if (isStraight) {
    newState.feedback = "Hold it!";
    newState.isCorrectForm = true;
    newState.visibilityIssue = false;
    newState.landmarksNeedingImprovement = [];
    // Timer handling is done in the main loop, but we flag it as valid here
  } else {
    newState.feedback = "Keep hips aligned";
    newState.isCorrectForm = false;
    newState.visibilityIssue = false;
    newState.landmarksNeedingImprovement = [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_ANKLE];
  }

  return newState;
};