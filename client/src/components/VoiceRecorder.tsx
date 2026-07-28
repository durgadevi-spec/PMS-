import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, Pause, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob | null) => void;
  onTranscription?: (text: string, isFinal: boolean) => void;
  onIsRecordingChange?: (isRecording: boolean) => void;
  maxDuration?: number; // in seconds
}

// Extend Window interface for SpeechRecognition
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export function VoiceRecorder({ onRecordingComplete, onTranscription, onIsRecordingChange, maxDuration = 300 }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState<"Idle" | "Listening" | "Recording" | "Processing" | "Completed">("Idle");
  const [interimText, setInterimText] = useState("");
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const interimTextRef = useRef("");

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      if (!window.isSecureContext && window.location.hostname !== "localhost") {
        alert("Microphone access requires a secure connection (HTTPS). Please access the site via HTTPS or ask your administrator to enable SSL.");
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Your browser does not support voice recording or it is blocked. Ensure you are using HTTPS.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        onRecordingComplete(audioBlob);
        setStatus("Completed");
        
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      // --- Speech Recognition Setup ---
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        
        // Auto-detect and prioritize en-IN for better local accent support if in India region
        const userLang = navigator.language || "en-US";
        recognition.lang = userLang.includes("in") || userLang.includes("IN") ? "en-IN" : userLang;
        
        // Improve accuracy for technical terms
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setStatus("Listening");
        };

        recognition.onresult = (event: any) => {
          let interimTranscript = "";
          let finalSegment = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalSegment += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalSegment && onTranscription) {
            console.log("[STT] Final Segment Captured:", finalSegment);
            onTranscription(finalSegment.trim(), true);
          }
          
          if (interimTranscript && onTranscription) {
            // Keep the parent informed even of interim results for 'fast' display
            onTranscription(interimTranscript.trim(), false);
          }
          
          interimTextRef.current = interimTranscript;
          setInterimText(interimTranscript);
        };

        recognition.onerror = (event: any) => {
          console.error("[STT] Recognition error:", event.error);
        };

        recognition.onend = () => {
          console.log("[STT] Recognition ended. isRecordingRef:", isRecordingRef.current);
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch (e) {
              console.warn("[STT] Restart failed:", e);
            }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      }

      mediaRecorder.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      if (onIsRecordingChange) onIsRecordingChange(true);
      setStatus("Recording");
      setRecordingTime(0);
      setAudioUrl(null);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure you have given permission and are using a secure (HTTPS) connection.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      setStatus("Processing");
      
      // If there's pending interim text, flush it to the parent
      if (interimTextRef.current && onTranscription) {
        console.log("[STT] Flushing final interim:", interimTextRef.current);
        onTranscription(interimTextRef.current.trim(), true);
        interimTextRef.current = "";
        setInterimText("");
      }

      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsRecording(false);
      isRecordingRef.current = false;
      if (onIsRecordingChange) onIsRecordingChange(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const deleteRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setStatus("Idle");
    onRecordingComplete(null);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/20 border-primary/20 shadow-sm transition-all duration-300">
      {!(window.SpeechRecognition || window.webkitSpeechRecognition) && (
        <div className="text-[10px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-100 mb-2">
          ⚠️ Your browser doesn't support live transcription. Voice will be saved as an attachment only.
        </div>
      )}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <div className="relative">
            <Mic className={`h-4 w-4 ${isRecording ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} />
            {isRecording && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          Voice Description
        </label>
        <div className="flex items-center gap-2">
          {status !== "Idle" && (
            <Badge variant="outline" className={cn(
              "font-semibold flex items-center gap-1.5",
              status === "Recording" ? "bg-red-50 border-red-200 text-red-600" :
              status === "Listening" ? "bg-blue-50 border-blue-200 text-blue-600" :
              status === "Processing" ? "bg-amber-50 border-amber-200 text-amber-600" :
              "bg-green-50 border-green-200 text-green-600"
            )}>
              {status === "Processing" && <Loader2 className="h-3 w-3 animate-spin" />}
              {status}
            </Badge>
          )}
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse tabular-nums">
              {formatTime(recordingTime)} / {formatTime(maxDuration)}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {!isRecording && !audioUrl && (
          <Button 
            type="button" 
            variant="outline" 
            onClick={startRecording}
            className="w-full flex items-center gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all active:scale-95 group"
          >
            <Mic className="h-4 w-4 group-hover:scale-110 transition-transform" /> Start Voice Description
          </Button>
        )}

        {isRecording && (
          <Button 
            type="button" 
            variant="destructive" 
            onClick={stopRecording}
            className="w-full flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
          >
            <Square className="h-4 w-4 fill-current" /> Stop Recording
          </Button>
        )}

        {audioUrl && !isRecording && (
          <div className="w-full flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300">
            <Button 
              type="button" 
              variant="outline" 
              size="icon" 
              onClick={togglePlayback}
              className="h-10 w-10 shrink-0 hover:bg-primary/10 hover:text-primary transition-colors"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            
            <div className="flex-1 h-10 flex items-center px-3 bg-background border rounded-md overflow-hidden relative group">
              <div className="text-xs font-mono text-muted-foreground z-10">
                {formatTime(recordingTime)}
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-primary/20 w-full group-hover:bg-primary/30 transition-colors" />
              <audio 
                ref={audioRef} 
                src={audioUrl} 
                onEnded={() => setIsPlaying(false)}
                className="hidden" 
              />
            </div>

            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={deleteRecording}
              className="h-10 w-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Delete recording"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={startRecording}
              className="h-10 w-10 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
              title="Re-record"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {isRecording && (
        <div className="space-y-2 p-2 bg-primary/5 rounded border border-primary/10 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between text-[10px] text-primary/70 font-semibold mb-1">
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Live Transcription
            </span>
            <span>{recordingTime}s</span>
          </div>
          <Progress value={(recordingTime / maxDuration) * 100} className="h-1 transition-all" />
          <div className="min-h-[40px] max-h-[80px] overflow-y-auto mt-2 p-2 bg-background/50 rounded border border-dashed border-primary/20">
            <p className="text-[11px] text-foreground leading-relaxed">
              {interimText ? (
                <span>{interimText}<span className="animate-pulse">|</span></span>
              ) : (
                <span className="text-muted-foreground italic">Listening for speech...</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Utility to merge class names
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
