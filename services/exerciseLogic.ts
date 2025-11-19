import { ExerciseState, Landmark } from '../types';
import { POSE_LANDMARKS } from './geometry';

// Helper types and functions
interface Point {
  x: number;
  y: number;
  z: number;
  vis: number;
}

function calculateAngle3D(a: Point, b: Point, c: Point): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const baz = a.z - b.z;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const bcz = c.z - b.z;
  
  const normBA = Math.sqrt(bax * bax + bay * bay + baz * baz);
  const normBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
  const den = Math.max(1e-9, normBA * normBC);
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy + baz * bcz) / den));
  
  return (Math.acos(cos) * 180) / Math.PI;
}

function calculateAngle2D(a: Point, b: Point, c: Point): number {
  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  
  const den = Math.max(1e-9, Math.hypot(bax, bay) * Math.hypot(bcx, bcy));
  const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / den));
  
  return (Math.acos(cos) * 180) / Math.PI;
}

function toPoint(landmark: Landmark, imageW: number = 1, imageH: number = 1): Point {
  return {
    x: landmark.x * imageW,
    y: landmark.y * imageH,
    z: landmark.z,
    vis: landmark.visibility ?? NaN
  };
}

function isVisible(point: Point, minVisibility: number = 0.6): boolean {
  return isNaN(point.vis) || point.vis >= minVisibility;
}

// ============================================================================
// PUSHUP COUNTER
// ============================================================================

enum PushupState {
  UNARMED = 'UNARMED',
  UP = 'UP',
  DOWN = 'DOWN'
}

class PushupCounter {
  private state: PushupState = PushupState.UNARMED;
  private count: number = 0;
  private elbowAngle: number = NaN;
  private kneeAngle: number = NaN;
  private formWarning: string = '';
  private legsQualified: boolean = false;

  constructor(
    private upThresh: number = 145.0,
    private downThresh: number = 70.0,
    private minVisibility: number = 0.6,
    private legExtendedThresh: number = 130.0
  ) {}

  reset(): void {
    this.state = PushupState.UNARMED;
    this.count = 0;
    this.elbowAngle = NaN;
    this.kneeAngle = NaN;
    this.formWarning = '';
    this.legsQualified = false;
  }

  update(landmarks: Landmark[], imageW: number, imageH: number, side: string = 'right'): void {
    if (landmarks.length < 33) return;

    const preferRight = side.toLowerCase().startsWith('r');

    // Convert landmarks to points
    const lsh = toPoint(landmarks[POSE_LANDMARKS.LEFT_SHOULDER], imageW, imageH);
    const rsh = toPoint(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER], imageW, imageH);
    const lel = toPoint(landmarks[POSE_LANDMARKS.LEFT_ELBOW], imageW, imageH);
    const rel = toPoint(landmarks[POSE_LANDMARKS.RIGHT_ELBOW], imageW, imageH);
    const lwr = toPoint(landmarks[POSE_LANDMARKS.LEFT_WRIST], imageW, imageH);
    const rwr = toPoint(landmarks[POSE_LANDMARKS.RIGHT_WRIST], imageW, imageH);
    const lhip = toPoint(landmarks[POSE_LANDMARKS.LEFT_HIP], imageW, imageH);
    const rhip = toPoint(landmarks[POSE_LANDMARKS.RIGHT_HIP], imageW, imageH);
    const lkn = toPoint(landmarks[POSE_LANDMARKS.LEFT_KNEE], imageW, imageH);
    const rkn = toPoint(landmarks[POSE_LANDMARKS.RIGHT_KNEE], imageW, imageH);
    const lank = toPoint(landmarks[POSE_LANDMARKS.LEFT_ANKLE], imageW, imageH);
    const rank = toPoint(landmarks[POSE_LANDMARKS.RIGHT_ANKLE], imageW, imageH);

    // Check arm visibility
    const armOK = (isRight: boolean) => {
      const sh = isRight ? rsh : lsh;
      const el = isRight ? rel : lel;
      const wr = isRight ? rwr : lwr;
      return isVisible(sh, this.minVisibility) && isVisible(el, this.minVisibility) && isVisible(wr, this.minVisibility);
    };

    // Choose which arm to use
    const useRight = armOK(preferRight) ? preferRight : (!armOK(!preferRight) ? preferRight : !preferRight);
    const sh = useRight ? rsh : lsh;
    const el = useRight ? rel : lel;
    const wr = useRight ? rwr : lwr;

    // Check leg visibility
    const legOK = (isRight: boolean) => {
      const hp = isRight ? rhip : lhip;
      const kn = isRight ? rkn : lkn;
      const an = isRight ? rank : lank;
      return isVisible(hp, this.minVisibility) && isVisible(kn, this.minVisibility) && isVisible(an, this.minVisibility);
    };

    const rightLegOk = legOK(true);
    const leftLegOk = legOK(false);
    const legSide = rightLegOk && leftLegOk ? useRight : (rightLegOk ? true : (leftLegOk ? false : null));

    // Calculate elbow angle
    this.elbowAngle = calculateAngle2D(sh, el, wr);

    // Calculate knee angle if legs visible
    if (legSide !== null) {
      const hp = legSide ? rhip : lhip;
      const kn = legSide ? rkn : lkn;
      const an = legSide ? rank : lank;
      this.kneeAngle = calculateAngle2D(hp, kn, an);
    } else {
      this.kneeAngle = NaN;
    }

    const legsVisible = legSide !== null;
    const legsExtended = legsVisible && !isNaN(this.kneeAngle) && this.kneeAngle >= this.legExtendedThresh;

    // State machine
    switch (this.state) {
      case PushupState.UNARMED:
        this.legsQualified = false;
        if (this.elbowAngle >= this.upThresh && legsExtended) {
          this.state = PushupState.UP;
        }
        break;
      case PushupState.UP:
        if (this.elbowAngle <= this.downThresh) {
          this.state = PushupState.DOWN;
          this.legsQualified = legsExtended;
        }
        break;
      case PushupState.DOWN:
        this.legsQualified = this.legsQualified || legsExtended;
        if (this.elbowAngle >= this.upThresh && this.legsQualified) {
          this.count += 1;
          this.state = PushupState.UP;
          this.legsQualified = false;
        }
        break;
    }

    // Update feedback
    const visibilityOK = isVisible(sh, this.minVisibility) && isVisible(el, this.minVisibility) && isVisible(wr, this.minVisibility);
    
    if (!visibilityOK) {
      this.formWarning = 'Arm not clearly visible';
    } else if (!legsVisible) {
      this.formWarning = 'Keep legs in frame';
    } else if (this.state === PushupState.UNARMED && this.elbowAngle >= this.upThresh && !legsExtended) {
      this.formWarning = 'Straighten your legs & arms';
    } else if (this.state === PushupState.DOWN && !this.legsQualified) {
      this.formWarning = 'Straighten your legs';
    } else if (this.state === PushupState.UP && this.elbowAngle < this.upThresh - 10.0) {
      this.formWarning = 'Extend your arms more';
    } else if (this.state !== PushupState.UP && this.elbowAngle > this.downThresh + 10.0) {
      this.formWarning = 'Go lower';
    } else {
      this.formWarning = '';
    }
  }

  getState(): { count: number; warning: string; state: string; elbowAngle: number; kneeAngle: number } {
    return {
      count: this.count,
      warning: this.formWarning,
      state: this.state,
      elbowAngle: this.elbowAngle,
      kneeAngle: this.kneeAngle
    };
  }
}

// ============================================================================
// SQUAT COUNTER
// ============================================================================

enum SquatState {
  UNARMED = 'UNARMED',
  UP = 'UP',
  DOWN = 'DOWN'
}

interface SquatMetrics {
  kneeAngle: number;
  hipAngle: number;
  legsVisible: boolean;
  standing: boolean;
  hipBelowKnee: boolean;
  kneeOverFootOK: boolean;
}

class SquatCounter {
  private state: SquatState = SquatState.UNARMED;
  private count: number = 0;
  private kneeAngle: number = NaN;
  private hipAngle: number = NaN;
  private formWarning: string = '';
  private liveWarning: string = '';
  private visibilityQualified: boolean = false;
  private kneeEma: number = NaN;
  private hipEma: number = NaN;

  constructor(
    private upThresh: number = 165.0,
    private downThresh: number = 95.0,
    private minVisibility: number = 0.6,
    private torsoLeanMax: number = 55.0,
    private smoothAlpha: number = 0.35
  ) {}

  reset(): void {
    this.state = SquatState.UNARMED;
    this.count = 0;
    this.kneeAngle = NaN;
    this.hipAngle = NaN;
    this.kneeEma = NaN;
    this.hipEma = NaN;
    this.formWarning = '';
    this.liveWarning = '';
    this.visibilityQualified = false;
  }

  private ema(prev: number, cur: number): number {
    if (this.smoothAlpha <= 0.0) return cur;
    if (isNaN(prev)) return cur;
    return this.smoothAlpha * cur + (1 - this.smoothAlpha) * prev;
  }

  private computeMetrics(landmarks: Landmark[], imageW: number, imageH: number, side: string): SquatMetrics {
    if (landmarks.length < 33) {
      return {
        kneeAngle: this.kneeAngle,
        hipAngle: this.hipAngle,
        legsVisible: false,
        standing: false,
        hipBelowKnee: false,
        kneeOverFootOK: true
      };
    }

    const preferRight = side.toLowerCase().startsWith('r');

    const lsh = toPoint(landmarks[POSE_LANDMARKS.LEFT_SHOULDER], imageW, imageH);
    const rsh = toPoint(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER], imageW, imageH);
    const lhip = toPoint(landmarks[POSE_LANDMARKS.LEFT_HIP], imageW, imageH);
    const rhip = toPoint(landmarks[POSE_LANDMARKS.RIGHT_HIP], imageW, imageH);
    const lkn = toPoint(landmarks[POSE_LANDMARKS.LEFT_KNEE], imageW, imageH);
    const rkn = toPoint(landmarks[POSE_LANDMARKS.RIGHT_KNEE], imageW, imageH);
    const lank = toPoint(landmarks[POSE_LANDMARKS.LEFT_ANKLE], imageW, imageH);
    const rank = toPoint(landmarks[POSE_LANDMARKS.RIGHT_ANKLE], imageW, imageH);

    const legOK = (isRight: boolean) => {
      const sh = isRight ? rsh : lsh;
      const hp = isRight ? rhip : lhip;
      const kn = isRight ? rkn : lkn;
      const an = isRight ? rank : lank;
      return isVisible(sh, this.minVisibility) && isVisible(hp, this.minVisibility) && 
             isVisible(kn, this.minVisibility) && isVisible(an, this.minVisibility);
    };

    const useRight = legOK(preferRight) ? preferRight : (!legOK(!preferRight) ? preferRight : !preferRight);
    
    const sh = useRight ? rsh : lsh;
    const hp = useRight ? rhip : lhip;
    const kn = useRight ? rkn : lkn;
    const an = useRight ? rank : lank;

    const kneeA = calculateAngle2D(hp, kn, an);
    const hipA = calculateAngle2D(sh, hp, kn);

    const legsVisible = isVisible(sh, this.minVisibility) && isVisible(hp, this.minVisibility) && 
                       isVisible(kn, this.minVisibility) && isVisible(an, this.minVisibility);
    const standing = kneeA >= this.upThresh;

    const depthMarginPx = imageH * 0.01;
    const hipBelowKnee = hp.y > kn.y + depthMarginPx;

    const kneeAnkleDx = Math.abs(kn.x - an.x);
    const kneeAnkleLen = Math.max(1e-6, Math.hypot(kn.x - an.x, kn.y - an.y));
    const kneeOverFootOK = (kneeAnkleDx / kneeAnkleLen) <= 0.45;

    return {
      kneeAngle: kneeA,
      hipAngle: hipA,
      legsVisible,
      standing,
      hipBelowKnee,
      kneeOverFootOK
    };
  }

  private depthReached(m: SquatMetrics): boolean {
    return m.kneeAngle <= this.downThresh && m.hipBelowKnee;
  }

  private warningFromMetrics(m: SquatMetrics): string {
    if (!m.legsVisible) return 'Keep legs in frame';
    if (this.state !== SquatState.DOWN && m.kneeAngle > this.downThresh + 12.0) return 'Go deeper';
    if (this.state !== SquatState.DOWN && !m.hipBelowKnee) return 'Drop hips below knees';
    if (this.state === SquatState.UP && m.kneeAngle < this.upThresh - 10.0) return 'Stand up fully';
    if (!m.kneeOverFootOK) return 'Align knee over foot';
    if (m.hipAngle < this.torsoLeanMax) return 'Keep chest up';
    return '';
  }

  update(landmarks: Landmark[], imageW: number, imageH: number, side: string = 'right'): void {
    const m = this.computeMetrics(landmarks, imageW, imageH, side);

    // Apply smoothing
    this.kneeEma = this.ema(this.kneeEma, m.kneeAngle);
    this.hipEma = this.ema(this.hipEma, m.hipAngle);

    this.kneeAngle = this.kneeEma;
    this.hipAngle = this.hipEma;

    const smoothedMetrics = { ...m, kneeAngle: this.kneeAngle, hipAngle: this.hipAngle };

    // State machine
    switch (this.state) {
      case SquatState.UNARMED:
        this.visibilityQualified = false;
        if (smoothedMetrics.standing && smoothedMetrics.legsVisible) {
          this.state = SquatState.UP;
        }
        break;
      case SquatState.UP:
        if (this.depthReached(smoothedMetrics)) {
          this.state = SquatState.DOWN;
          this.visibilityQualified = smoothedMetrics.legsVisible;
        }
        break;
      case SquatState.DOWN:
        this.visibilityQualified = this.visibilityQualified && smoothedMetrics.legsVisible;
        if (smoothedMetrics.standing && this.visibilityQualified) {
          this.count += 1;
          this.state = SquatState.UP;
          this.visibilityQualified = false;
        }
        break;
    }

    this.formWarning = this.warningFromMetrics(smoothedMetrics);
    this.liveWarning = this.formWarning;
  }

  getState(): { count: number; warning: string; state: string; kneeAngle: number; hipAngle: number } {
    return {
      count: this.count,
      warning: this.formWarning,
      state: this.state,
      kneeAngle: this.kneeAngle,
      hipAngle: this.hipAngle
    };
  }
}

// ============================================================================
// PLANK EVALUATOR
// ============================================================================

enum PlankState {
  NOT_READY = 'NOT_READY',
  READY = 'READY',
  HOLDING = 'HOLDING'
}

enum PlankType {
  HIGH = 'HIGH',
  FOREARM = 'FOREARM',
  UNKNOWN = 'UNKNOWN'
}

class PlankEvaluator {
  private state: PlankState = PlankState.NOT_READY;
  private plankType: PlankType = PlankType.UNKNOWN;
  private overallScore: number = 0.0;
  private holdTime: number = 0.0;
  private bestHold: number = 0.0;
  private totalTime: number = 0.0;

  private hipScore: number = 1.0;
  private headScore: number = 1.0;
  private stackScore: number = 1.0;
  private underScore: number = 1.0;
  private feetScore: number = 1.0;

  private hipAngle: number = NaN;
  private headAngle: number = NaN;
  private shoulderMisalignment: number = NaN;
  private hipMisalignment: number = NaN;
  private underShoulderDist: number = NaN;
  private feetWidthRatio: number = NaN;

  private formWarnings: string[] = [];

  private stateStartTime: number = Date.now();
  private holdStartTime: number | null = null;
  private lastUpdateTime: number = Date.now();

  private hipAngSmooth: number = NaN;
  private headAngSmooth: number = NaN;
  private stackShSmooth: number = NaN;
  private stackHipSmooth: number = NaN;
  private underSmooth: number = NaN;
  private feetWSmooth: number = NaN;

  constructor(
    private hipOkRange: [number, number] = [165.0, 180.0],
    private hipSagMax: number = 150.0,
    private hipPikeMin: number = 190.0,
    private headOkRange: [number, number] = [155.0, 200.0],
    private stackOkMaxDeg: number = 6.0,
    private underShoulderPxNorm: number = 0.25,
    private feetMaxWidth: number = 1.4,
    private feetMinWidth: number = 0.7,
    private emaAlpha: number = 0.35,
    private minVisibility: number = 0.5,
    private readySeconds: number = 1.0,
    private weights: Record<string, number> = {
      hip: 0.35,
      head: 0.15,
      stack: 0.15,
      under: 0.2,
      feet: 0.15
    }
  ) {}

  reset(): void {
    this.state = PlankState.NOT_READY;
    this.plankType = PlankType.UNKNOWN;
    this.overallScore = 0.0;
    this.holdTime = 0.0;
    this.bestHold = 0.0;
    this.totalTime = 0.0;
    this.hipScore = 1.0;
    this.headScore = 1.0;
    this.stackScore = 1.0;
    this.underScore = 1.0;
    this.feetScore = 1.0;
    this.hipAngle = NaN;
    this.headAngle = NaN;
    this.shoulderMisalignment = NaN;
    this.hipMisalignment = NaN;
    this.underShoulderDist = NaN;
    this.feetWidthRatio = NaN;
    this.formWarnings = [];
    this.stateStartTime = Date.now();
    this.holdStartTime = null;
    this.lastUpdateTime = Date.now();
    this.hipAngSmooth = NaN;
    this.headAngSmooth = NaN;
    this.stackShSmooth = NaN;
    this.stackHipSmooth = NaN;
    this.underSmooth = NaN;
    this.feetWSmooth = NaN;
  }

  private ema(prev: number, newVal: number): number {
    if (isNaN(prev) || isNaN(newVal)) return newVal;
    return this.emaAlpha * newVal + (1 - this.emaAlpha) * prev;
  }

  private angle3(a: Point, b: Point, c: Point): number {
    const bax = a.x - b.x;
    const bay = a.y - b.y;
    const baz = a.z - b.z;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const bcz = c.z - b.z;
    
    const normBA = Math.sqrt(bax * bax + bay * bay + baz * baz);
    const normBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
    const den = Math.max(1e-9, normBA * normBC);
    const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy + baz * bcz) / den));
    const ang = (Math.acos(cos) * 180) / Math.PI;
    
    return 180.0 - ang + 180.0; // Center straight line around 180°
  }

  private verticalMisalignDeg(l: Point, r: Point): number {
    const dx = r.x - l.x;
    const dy = r.y - l.y;
    const dz = r.z - l.z;
    const norm = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (norm < 1e-6) return NaN;

    const horizNorm = Math.hypot(dx, dz);
    if (horizNorm < 1e-6) return NaN;

    const cos = Math.max(-1, Math.min(1, horizNorm / norm));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  private classifyPlank(lsh: Point, rsh: Point, lel: Point, rel: Point, lwr: Point, rwr: Point): PlankType {
    const allVisible = isVisible(lsh, this.minVisibility) && isVisible(rsh, this.minVisibility) &&
                      isVisible(lel, this.minVisibility) && isVisible(rel, this.minVisibility) &&
                      isVisible(lwr, this.minVisibility) && isVisible(rwr, this.minVisibility);
    if (!allVisible) return PlankType.UNKNOWN;

    const avgDiff = ((lel.y - lwr.y) + (rel.y - rwr.y)) / 2.0;
    if (avgDiff < -0.02) return PlankType.HIGH;
    if (avgDiff > 0.02) return PlankType.FOREARM;

    // Fallback: check elbow angle
    const elbowAngle = (lsh: Point, lel: Point, lwr: Point): number => {
      const bax = lsh.x - lel.x;
      const bay = lsh.y - lel.y;
      const baz = lsh.z - lel.z;
      const bcx = lwr.x - lel.x;
      const bcy = lwr.y - lel.y;
      const bcz = lwr.z - lel.z;
      
      const normBA = Math.sqrt(bax * bax + bay * bay + baz * baz);
      const normBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);
      if (normBA < 1e-6 || normBC < 1e-6) return NaN;
      
      const cos = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy + baz * bcz) / (normBA * normBC)));
      return (Math.acos(cos) * 180) / Math.PI;
    };

    const angL = elbowAngle(lsh, lel, lwr);
    const angR = elbowAngle(rsh, rel, rwr);
    const ang = !isNaN(angL) && !isNaN(angR) ? (angL + angR) / 2.0 : (!isNaN(angL) ? angL : angR);

    if (isNaN(ang)) return PlankType.UNKNOWN;
    return ang > 150 ? PlankType.HIGH : PlankType.FOREARM;
  }

  update(landmarks: Landmark[], imageW: number, imageH: number): void {
    if (landmarks.length < 33) return;

    const lsh = toPoint(landmarks[POSE_LANDMARKS.LEFT_SHOULDER], imageW, imageH);
    const rsh = toPoint(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER], imageW, imageH);
    const lel = toPoint(landmarks[POSE_LANDMARKS.LEFT_ELBOW], imageW, imageH);
    const rel = toPoint(landmarks[POSE_LANDMARKS.RIGHT_ELBOW], imageW, imageH);
    const lwr = toPoint(landmarks[POSE_LANDMARKS.LEFT_WRIST], imageW, imageH);
    const rwr = toPoint(landmarks[POSE_LANDMARKS.RIGHT_WRIST], imageW, imageH);
    const lhip = toPoint(landmarks[POSE_LANDMARKS.LEFT_HIP], imageW, imageH);
    const rhip = toPoint(landmarks[POSE_LANDMARKS.RIGHT_HIP], imageW, imageH);
    const lkn = toPoint(landmarks[POSE_LANDMARKS.LEFT_KNEE], imageW, imageH);
    const rkn = toPoint(landmarks[POSE_LANDMARKS.RIGHT_KNEE], imageW, imageH);
    const lank = toPoint(landmarks[POSE_LANDMARKS.LEFT_ANKLE], imageW, imageH);
    const rank = toPoint(landmarks[POSE_LANDMARKS.RIGHT_ANKLE], imageW, imageH);
    const lear = toPoint(landmarks[7], imageW, imageH); // LEFT_EAR
    const rear = toPoint(landmarks[8], imageW, imageH); // RIGHT_EAR

    // Check critical visibility
    const leftSideVisible = isVisible(lsh, this.minVisibility) && isVisible(lkn, this.minVisibility);
    const rightSideVisible = isVisible(rsh, this.minVisibility) && isVisible(rkn, this.minVisibility);
    const criticalPointsVisible = leftSideVisible || rightSideVisible;

    if (!criticalPointsVisible) {
      if (this.state !== PlankState.NOT_READY) {
        this.state = PlankState.NOT_READY;
        this.stateStartTime = Date.now();
        this.holdStartTime = null;
      }
      this.formWarnings = ['Keep at least one shoulder and knee visible'];
      this.overallScore = 0.0;
      return;
    }

    // Average left/right for midpoints
    const avg = (a: Point, b: Point): Point => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2,
      vis: (a.vis + b.vis) / 2
    });

    const sho = avg(lsh, rsh);
    const hip = avg(lhip, rhip);
    const ank = avg(lank, rank);
    const ear = avg(lear, rear);

    const scale = Math.hypot(sho.x - hip.x, sho.y - hip.y);

    // Compute core angles
    this.hipAngle = this.angle3(sho, hip, ank);
    this.headAngle = this.angle3(ear, sho, hip);
    this.shoulderMisalignment = this.verticalMisalignDeg(lsh, rsh);
    this.hipMisalignment = this.verticalMisalignDeg(lhip, rhip);

    // Classify plank type
    this.plankType = this.classifyPlank(lsh, rsh, lel, rel, lwr, rwr);

    // Under-shoulder alignment
    const baseL = this.plankType === PlankType.HIGH ? lwr : lel;
    const baseR = this.plankType === PlankType.HIGH ? rwr : rel;

    const horizDist = (base: Point, sh: Point): number => {
      const dx = base.x - sh.x;
      const dz = base.z - sh.z;
      return Math.hypot(dx, dz);
    };

    this.underShoulderDist = (horizDist(baseL, lsh) + horizDist(baseR, rsh)) / 2.0;

    // Feet width
    const hipW = (Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y) + Math.hypot(lhip.x - rhip.x, lhip.y - rhip.y)) / 2.0;
    this.feetWidthRatio = Math.hypot(lank.x - rank.x, lank.y - rank.y) / Math.max(hipW, 1.0);

    // Apply smoothing
    this.hipAngSmooth = this.ema(this.hipAngSmooth, this.hipAngle);
    this.headAngSmooth = this.ema(this.headAngSmooth, this.headAngle);
    this.stackShSmooth = this.ema(this.stackShSmooth, this.shoulderMisalignment);
    this.stackHipSmooth = this.ema(this.stackHipSmooth, this.hipMisalignment);
    this.underSmooth = this.ema(this.underSmooth, this.underShoulderDist / Math.max(scale, 1.0));
    this.feetWSmooth = this.ema(this.feetWSmooth, this.feetWidthRatio);

    // Quality assessment
    const issues: string[] = [];

    // Hip alignment
    this.hipScore = 1.0;
    if (!isNaN(this.hipAngSmooth)) {
      if (this.hipAngSmooth < this.hipSagMax) {
        issues.push('Hips sagging too much');
        this.hipScore = Math.max(0.0, (this.hipAngSmooth - 90.0) / (this.hipSagMax - 90.0));
      } else if (this.hipAngSmooth < this.hipOkRange[0]) {
        issues.push('Lift hips slightly');
        const range = this.hipOkRange[0] - this.hipSagMax;
        this.hipScore = 0.5 + 0.5 * ((this.hipAngSmooth - this.hipSagMax) / range);
      } else if (this.hipAngSmooth > this.hipPikeMin) {
        issues.push('Lower hips (piking)');
        this.hipScore = Math.max(0.0, 1.0 - (this.hipAngSmooth - this.hipPikeMin) / 20.0);
      } else if (this.hipAngSmooth > this.hipOkRange[1]) {
        issues.push('Lower hips slightly');
        const range = this.hipPikeMin - this.hipOkRange[1];
        this.hipScore = 0.5 + 0.5 * (1.0 - (this.hipAngSmooth - this.hipOkRange[1]) / range);
      }
    }

    // Head alignment
    this.headScore = 1.0;
    if (!isNaN(this.headAngSmooth)) {
      if (this.headAngSmooth < this.headOkRange[0]) {
        issues.push('Look forward (head dropping)');
        const range = this.headOkRange[0] - 90.0;
        this.headScore = Math.max(0.0, (this.headAngSmooth - 90.0) / range);
      } else if (this.headAngSmooth < this.headOkRange[0] + 10) {
        const range = 10.0;
        this.headScore = 0.8 + 0.2 * ((this.headAngSmooth - this.headOkRange[0]) / range);
      }
    }

    // Shoulder/hip stacking
    this.stackScore = 1.0;
    if (!isNaN(this.stackShSmooth) && !isNaN(this.stackHipSmooth)) {
      const maxMis = Math.max(this.stackShSmooth, this.stackHipSmooth);
      if (maxMis > this.stackOkMaxDeg) {
        issues.push('Align shoulders/hips (no twist)');
        this.stackScore = Math.max(0.0, 1.0 - (maxMis - this.stackOkMaxDeg) / 15.0);
      }
    }

    // Under-shoulder alignment
    this.underScore = 1.0;
    if (!isNaN(this.underSmooth)) {
      if (this.underSmooth > this.underShoulderPxNorm) {
        issues.push('Position hands/elbows under shoulders');
        this.underScore = Math.max(0.0, 1.0 - (this.underSmooth - this.underShoulderPxNorm) / 0.3);
      }
    }

    // Feet width
    this.feetScore = 1.0;
    if (!isNaN(this.feetWSmooth)) {
      if (this.feetWSmooth < this.feetMinWidth) {
        issues.push('Widen feet to hip-width');
        this.feetScore = Math.max(0.0, this.feetWSmooth / this.feetMinWidth);
      } else if (this.feetWSmooth > this.feetMaxWidth) {
        issues.push('Narrow feet to hip-width');
        this.feetScore = Math.max(0.0, 1.0 - (this.feetWSmooth - this.feetMaxWidth) / 0.6);
      }
    }

    // Overall score
    this.overallScore = (
      (this.weights['hip'] || 0.35) * this.hipScore +
      (this.weights['head'] || 0.15) * this.headScore +
      (this.weights['stack'] || 0.15) * this.stackScore +
      (this.weights['under'] || 0.2) * this.underScore +
      (this.weights['feet'] || 0.15) * this.feetScore
    ) * 100.0;

    this.formWarnings = issues;

    // State machine
    const now = Date.now();
    const stableCoreVisible = isVisible(lsh, this.minVisibility) && isVisible(rsh, this.minVisibility) &&
                             isVisible(lhip, this.minVisibility) && isVisible(rhip, this.minVisibility) &&
                             isVisible(lank, this.minVisibility) && isVisible(rank, this.minVisibility);
    const stableEnough = this.overallScore > 50 && stableCoreVisible;

    switch (this.state) {
      case PlankState.NOT_READY:
        if (stableEnough) {
          this.state = PlankState.READY;
          this.stateStartTime = now;
        }
        break;
      case PlankState.READY:
        if (!stableEnough) {
          this.state = PlankState.NOT_READY;
          this.stateStartTime = now;
        } else {
          const elapsed = (now - this.stateStartTime) / 1000.0;
          if (elapsed >= this.readySeconds) {
            this.state = PlankState.HOLDING;
            this.holdStartTime = now;
          }
        }
        break;
      case PlankState.HOLDING:
        const deltaTime = (now - this.lastUpdateTime) / 1000.0;
        this.totalTime += deltaTime;

        if (!stableEnough) {
          this.state = PlankState.NOT_READY;
          this.stateStartTime = now;
          this.holdStartTime = null;
        }
        break;
    }

    // Update hold time
    this.holdTime = this.holdStartTime ? (now - this.holdStartTime) / 1000.0 : 0.0;
    this.bestHold = Math.max(this.bestHold, this.holdTime);

    this.lastUpdateTime = now;
  }

  getState(): { 
    count: number; 
    warning: string; 
    state: string; 
    holdTime: number; 
    bestHold: number;
    overallScore: number;
  } {
    return {
      count: 0, // Plank doesn't count reps
      warning: this.formWarnings[0] || '',
      state: this.state,
      holdTime: this.holdTime,
      bestHold: this.bestHold,
      overallScore: this.overallScore
    };
  }

  getStateLabel(): string {
    switch (this.state) {
      case PlankState.NOT_READY: return 'Get in position';
      case PlankState.READY: return 'Hold steady...';
      case PlankState.HOLDING: return 'Holding';
    }
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

const pushupCounter = new PushupCounter();
const squatCounter = new SquatCounter();
const plankEvaluator = new PlankEvaluator();

// ============================================================================
// WRAPPER FUNCTIONS FOR COMPATIBILITY
// ============================================================================

export const processPushup = (landmarks: Landmark[], state: ExerciseState): ExerciseState => {
  // Assume 640x480 as default dimensions (can be adjusted based on actual video size)
  const imageW = 640;
  const imageH = 480;
  
  pushupCounter.update(landmarks, imageW, imageH, 'right');
  const counterState = pushupCounter.getState();
  
  let newState: ExerciseState = {
    count: counterState.count,
    feedback: counterState.warning || (counterState.state === 'UP' ? 'Go Down' : counterState.state === 'DOWN' ? 'Push Up' : 'Get Ready'),
    isCorrectForm: counterState.warning === '',
    stage: counterState.state === 'UP' ? 'UP' : counterState.state === 'DOWN' ? 'DOWN' : 'NEUTRAL',
    visibilityIssue: counterState.warning.includes('visible') || counterState.warning.includes('frame'),
    landmarksNeedingImprovement: []
  };
  
  // Determine which landmarks need improvement based on warning
  if (counterState.warning.includes('legs')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_KNEE, 
      POSE_LANDMARKS.RIGHT_KNEE,
      POSE_LANDMARKS.LEFT_HIP,
      POSE_LANDMARKS.RIGHT_HIP
    ];
  } else if (counterState.warning.includes('arms')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_ELBOW,
      POSE_LANDMARKS.RIGHT_ELBOW,
      POSE_LANDMARKS.LEFT_WRIST,
      POSE_LANDMARKS.RIGHT_WRIST
    ];
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

  // Gate: Check visibility of Hip and Knee
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

  // Calculate angles
  if (isLeftVisible && isRightVisible) {
    const leftLegAngle = calculateAngle2D(toPoint(leftHip, 1, 1), toPoint(leftKnee, 1, 1), toPoint(leftAnkle, 1, 1));
    const rightLegAngle = calculateAngle2D(toPoint(rightHip, 1, 1), toPoint(rightKnee, 1, 1), toPoint(rightAnkle, 1, 1));
    kneeAngle = (leftLegAngle + rightLegAngle) / 2;
    checkLean = false;
  } else if (isLeftVisible) {
    kneeAngle = calculateAngle2D(toPoint(leftHip, 1, 1), toPoint(leftKnee, 1, 1), toPoint(leftAnkle, 1, 1));
    hipAngle = calculateAngle2D(toPoint(leftShoulder, 1, 1), toPoint(leftHip, 1, 1), toPoint(leftKnee, 1, 1));
    checkLean = true;
  } else {
    kneeAngle = calculateAngle2D(toPoint(rightHip, 1, 1), toPoint(rightKnee, 1, 1), toPoint(rightAnkle, 1, 1));
    hipAngle = calculateAngle2D(toPoint(rightShoulder, 1, 1), toPoint(rightHip, 1, 1), toPoint(rightKnee, 1, 1));
    checkLean = true;
  }

  // Thresholds
  const UP_THRESH = 165.0;
  const DOWN_THRESH = 95.0;
  const TORSO_LEAN_MAX = 55.0;

  // Form Check: Torso Lean
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
  const imageW = 640;
  const imageH = 480;
  
  plankEvaluator.update(landmarks, imageW, imageH);
  const evaluatorState = plankEvaluator.getState();
  
  let newState: ExerciseState = {
    count: 0, // Plank doesn't count reps
    feedback: evaluatorState.warning || plankEvaluator.getStateLabel(),
    isCorrectForm: evaluatorState.warning === '' && evaluatorState.state === 'HOLDING',
    stage: 'NEUTRAL',
    timer: evaluatorState.holdTime,
    visibilityIssue: evaluatorState.warning.includes('visible'),
    landmarksNeedingImprovement: []
  };
  
  // Determine which landmarks need improvement
  if (evaluatorState.warning.includes('hips')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_SHOULDER,
      POSE_LANDMARKS.RIGHT_SHOULDER,
      POSE_LANDMARKS.LEFT_HIP,
      POSE_LANDMARKS.RIGHT_HIP,
      POSE_LANDMARKS.LEFT_ANKLE,
      POSE_LANDMARKS.RIGHT_ANKLE
    ];
  } else if (evaluatorState.warning.includes('head')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_SHOULDER,
      POSE_LANDMARKS.RIGHT_SHOULDER
    ];
  } else if (evaluatorState.warning.includes('shoulders') || evaluatorState.warning.includes('twist')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_SHOULDER,
      POSE_LANDMARKS.RIGHT_SHOULDER,
      POSE_LANDMARKS.LEFT_HIP,
      POSE_LANDMARKS.RIGHT_HIP
    ];
  } else if (evaluatorState.warning.includes('hands') || evaluatorState.warning.includes('elbows')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_WRIST,
      POSE_LANDMARKS.RIGHT_WRIST,
      POSE_LANDMARKS.LEFT_ELBOW,
      POSE_LANDMARKS.RIGHT_ELBOW,
      POSE_LANDMARKS.LEFT_SHOULDER,
      POSE_LANDMARKS.RIGHT_SHOULDER
    ];
  } else if (evaluatorState.warning.includes('feet')) {
    newState.landmarksNeedingImprovement = [
      POSE_LANDMARKS.LEFT_ANKLE,
      POSE_LANDMARKS.RIGHT_ANKLE
    ];
  }
  
  return newState;
};