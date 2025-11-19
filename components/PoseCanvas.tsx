import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
import { ExerciseType, ExerciseState, Landmark } from '../types';
import { processPushup, processSquat, processPlank } from '../services/exerciseLogic';

interface PoseCanvasProps {
  exerciseType: ExerciseType;
  onUpdate: (state: ExerciseState) => void;
}

const PoseCanvas: React.FC<PoseCanvasProps> = ({ exerciseType, onUpdate }) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const requestRef = useRef<number>(0);
  
  // Internal state tracker for logic
  const exerciseStateRef = useRef<ExerciseState>({
    count: 0,
    feedback: 'Get Ready',
    isCorrectForm: true,
    stage: 'NEUTRAL',
    timer: 0,
  });
  
  // Timer specifically for plank
  const lastFrameTimeRef = useRef<number>(0);

  useEffect(() => {
    const initMediaPipe = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      
      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });
      
      setIsLoading(false);
      startPrediction();
    };

    initMediaPipe();

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      landmarkerRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPrediction = () => {
    const predict = () => {
      if (
        landmarkerRef.current &&
        webcamRef.current &&
        webcamRef.current.video &&
        webcamRef.current.video.readyState === 4
      ) {
        const video = webcamRef.current.video;
        const canvas = canvasRef.current;
        
        if (canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          
          const startTimeMs = performance.now();
          const result = landmarkerRef.current.detectForVideo(video, startTimeMs);
          
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (result.landmarks && result.landmarks.length > 0) {
              const landmarks = result.landmarks[0] as unknown as Landmark[];
              const drawingUtils = new DrawingUtils(ctx);
              
              // Process Exercise Logic first to get state
              let newState = { ...exerciseStateRef.current };
              
              if (exerciseType === ExerciseType.PUSHUP) {
                newState = processPushup(landmarks, newState);
              } else if (exerciseType === ExerciseType.SQUAT) {
                newState = processSquat(landmarks, newState);
              } else if (exerciseType === ExerciseType.PLANK) {
                newState = processPlank(landmarks, newState);
                // Plank timer logic
                if (newState.isCorrectForm) {
                    const now = Date.now();
                    if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = now;
                    const delta = (now - lastFrameTimeRef.current) / 1000;
                    newState.timer = (newState.timer || 0) + delta;
                    lastFrameTimeRef.current = now;
                } else {
                    lastFrameTimeRef.current = 0; // Stop counting if form breaks
                }
              }
              
              // Determine colors based on state
              const landmarksNeedingImprovement = new Set(newState.landmarksNeedingImprovement || []);
              const isVisibilityIssue = newState.visibilityIssue || false;
              
              // Draw landmarks with conditional colors
              drawingUtils.drawLandmarks(result.landmarks[0], {
                radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
                color: (data) => {
                  const index = result.landmarks[0].indexOf(data.from!);
                  if (isVisibilityIssue) return "#ef4444"; // Red for visibility issues
                  if (landmarksNeedingImprovement.has(index)) return "#f97316"; // Orange for form issues
                  return "#4ade80"; // Green for good form
                },
                lineWidth: 2
              });
              
              // Draw connectors with selective coloring
              const connections = PoseLandmarker.POSE_CONNECTIONS;
              for (const connection of connections) {
                // MediaPipe Connection type has start and end properties
                const startIdx = (connection as any).start ?? 0;
                const endIdx = (connection as any).end ?? 0;
                const startNeedsImprovement = landmarksNeedingImprovement.has(startIdx);
                const endNeedsImprovement = landmarksNeedingImprovement.has(endIdx);
                
                let connectionColor = "#ffffff"; // Default white for good form
                if (isVisibilityIssue) {
                  connectionColor = "#ef4444"; // Red for visibility issues
                } else if (startNeedsImprovement || endNeedsImprovement) {
                  connectionColor = "#f97316"; // Orange if either endpoint needs improvement
                }
                
                drawingUtils.drawConnectors(result.landmarks[0], [connection], {
                  color: connectionColor,
                  lineWidth: 4
                });
              }

              // Update Refs and Parent
              exerciseStateRef.current = newState;
              onUpdate(newState);
            }
          }
        }
      }
      requestRef.current = requestAnimationFrame(predict);
    };
    
    requestRef.current = requestAnimationFrame(predict);
  };

  return (
    <div className="relative w-full h-full bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-slate-900">
           <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
           <p className="ml-4 text-cyan-500 font-semibold">Loading Vision Model...</p>
        </div>
      )}
      
      <Webcam
        ref={webcamRef}
        className="absolute inset-0 w-full h-full object-cover"
        mirrored={false} // Generally for exercise back camera or non-mirrored front is better, but usually front is mirrored. Let's keep false for now to align with standard video.
        screenshotFormat="image/jpeg"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
};

export default PoseCanvas;