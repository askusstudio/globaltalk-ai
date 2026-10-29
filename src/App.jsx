import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import {
  Activity, AudioLines, BookOpen, Brain, BriefcaseBusiness, CalendarDays, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Globe2, History, Languages, LogIn, LogOut, Mic,
  MicOff, Pause, Play, RotateCcw, Settings2, Sparkles, Target, Volume2, X, Menu,
  Flame, Award, ShieldCheck, ArrowRight, Download, Info
} from "lucide-react";
import { LANGUAGES, LEVELS, MODES, ROADMAP, makeTutorPrompt } from "./data";
import { auth, db, firebaseConfigured, GoogleAuthProvider, signInWithPopup, signOut } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";

const localKey = "globaltalk_sessions_v1";
const profileKey = "globaltalk_profile_v1";
const defaultProfile = { selectedLanguage: "en-US", level: "A1", correction: true, nativeSupport: true, dailyGoal: 90 };

function loadProfile() {
  try {
    return { ...defaultProfile, ...JSON.parse(localStorage.getItem(profileKey) || "{}") };
  } catch {
    return defaultProfile;
  }
}

function b64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pcmToAudioBuffer(ctx, base64, sampleRate = 24000) {
  const bytes = b64ToBytes(base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const samples = Math.floor(bytes.byteLength / 2);
  const buffer = ctx.createBuffer(1, samples, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
  return buffer;
}

function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return out;
}

function downsampleTo16k(buffer, inputRate) {
  if (inputRate === 16000) return buffer;
  const ratio = inputRate / 16000;
  const newLength = Math.floor(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), buffer.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += buffer[j];
    result[i] = sum / Math.max(1, end - start);
  }
  return result;
}

function pcmBase64(float32, sampleRate) {
  const pcm = floatTo16BitPCM(downsampleTo16k(float32, sampleRate));
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function readLocalSessions() {
  try {
    return JSON.parse(localStorage.getItem(localKey) || "[]");
  } catch {
    return [];
  }
}

function scoreSession(session) {
  const base = { speaking: session.minutes >= 5 ? 3 : 1, consistency: 2, business: session.mode === "business" ? 3 : 0 };
  return Math.min(100, 40 + base.speaking * 8 + base.consistency * 4 + base.business * 5);
}

export default function App() {
  const [profile, setProfile] = useState(loadProfile);
  const [mode, setMode] = useState("daily");
  const [activeTab, setActiveTab] = useState("coach");
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("idle");
  const [statusText, setStatusText] = useState("Ready when you are");
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState(readLocalSessions);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [error, setError] = useState("");
  const [textInput, setTextInput] = useState("");
  const [cloudNotice, setCloudNotice] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const sessionRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const outputCursorRef = useRef(0);
  const messagesRef = useRef([]);
  const startedAtRef = useRef(null);
  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const lang = useMemo(() => {
    return LANGUAGES.find(l => l.id === profile.selectedLanguage) || LANGUAGES[0];
  }, [profile.selectedLanguage]);

  useEffect(() => {
    localStorage.setItem(profileKey, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    messagesRef.current = messages;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (!firebaseConfigured || !auth) return;
    const unsub = onAuthStateChanged(auth, setUser);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user && db) {
      refreshCloudSessions();
    }
  }, [user]);

  useEffect(() => {
    if (status !== "connected") return;
    timerRef.current = setInterval(() => {
      if (startedAtRef.current) {
        setSessionSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [status]);

  async function refreshCloudSessions() {
    try {
      const q = query(collection(db, "users", user.uid, "sessions"), orderBy("createdAt", "desc"), limit(50));
      const snap = await getDocs(q);
      const cloud = snap.docs.map(d => ({ id: d.id, ...d.data(), cloud: true }));
      setSessions(prev => {
        const merged = [...cloud, ...prev.filter(p => !cloud.some(c => c.id === p.id))];
        localStorage.setItem(localKey, JSON.stringify(merged));
        return merged.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      });
      setCloudNotice("Cloud session history is fully synced.");
    } catch (e) {
      setCloudNotice("Cloud sync unavailable. Local session history remains saved.");
    }
  }

  async function login() {
    if (!firebaseConfigured) {
      setCloudNotice("Firebase web credentials are not configured in your environment. GlobalTalk is running in local mode.");
      return;
    }
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      setError(e.message || "Google Sign-in could not be completed.");
    }
  }

  function addMessage(role, text) {
    if (!text?.trim()) return;
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role, text: text.trim(), at: new Date().toISOString() }]);
  }

  async function startSession() {
    setError("");
    setMessages([]);
    setSessionSeconds(0);
    setStatus("connecting");
    setStatusText("Establishing encrypted voice channel…");
    try {
      // Dynamic API URL for development and production
      const apiBase = import.meta.env.VITE_API_URL || "";
      const tokenResponse = await fetch(`${apiBase}/api/live-token`, { method: "POST" });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error || "Could not obtain an ephemeral Live API token.");
      }

      const ai = new GoogleGenAI({ apiKey: tokenData.token, httpOptions: { apiVersion: "v1beta" } });
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      audioContextRef.current = audioContext;
      outputCursorRef.current = audioContext.currentTime;

      const systemInstruction = makeTutorPrompt({
        language: lang,
        level: profile.level,
        mode: MODES.find(m => m.id === mode)?.label || mode,
        correction: profile.correction,
        nativeSupport: profile.nativeSupport
      });

      const session = await ai.live.connect({
        model: "gemini-3.8-live",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          sessionResumption: {}
        },
        callbacks: {
          onopen: async () => {
            setStatus("connected");
            setStatusText("Voice coach connected — speak naturally");
            startedAtRef.current = Date.now();
          },
          onmessage: (message) => {
            const sc = message.serverContent;
            if (sc?.inputTranscription?.text) addMessage("you", sc.inputTranscription.text);
            if (sc?.outputTranscription?.text) addMessage("coach", sc.outputTranscription.text);
            const parts = sc?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data && audioContextRef.current) {
                try {
                  const buffer = pcmToAudioBuffer(audioContextRef.current, part.inlineData.data, 24000);
                  const source = audioContextRef.current.createBufferSource();
                  source.buffer = buffer;
                  source.connect(audioContextRef.current.destination);
                  const now = audioContextRef.current.currentTime;
                  outputCursorRef.current = Math.max(outputCursorRef.current, now + 0.02);
                  source.start(outputCursorRef.current);
                  outputCursorRef.current += buffer.duration;
                } catch (e) {
                  console.warn("Audio playback chunk warning:", e);
                }
              }
            }
            if (sc?.turnComplete) setStatusText("Your turn — coach is listening");
            if (sc?.interrupted) {
              outputCursorRef.current = audioContextRef.current?.currentTime || 0;
              setStatusText("Coach paused — listening to you");
            }
          },
          onerror: (e) => {
            setError(e?.message || "Live session connection interrupted.");
            setStatusText("Connection error");
          },
          onclose: () => {
            if (status !== "idle") setStatusText("Session ended");
          }
        }
      });

      sessionRef.current = session;
      session.sendRealtimeInput({
        text: `Start the ${mode} session now. Greet me warmly and briefly in ${lang.name}, then ask me one level-appropriate opening question for level ${profile.level}. Be proactive.`
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        if (!sessionRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        const base64 = pcmBase64(input, audioContext.sampleRate);
        sessionRef.current.sendRealtimeInput({ audio: { data: base64, mimeType: "audio/pcm;rate=16000" } });
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      addMessage("system", `Live practice started: ${lang.name} (${lang.market}) · Level ${profile.level} · ${MODES.find(m => m.id === mode)?.label || mode}`);
    } catch (e) {
      setError(e.message || "Unable to start voice session. Please ensure microphone permissions are granted.");
      setStatus("idle");
      setStatusText("Could not connect");
      cleanupAudio();
    }
  }

  function cleanupAudio() {
    try { processorRef.current?.disconnect(); } catch {}
    try { sourceRef.current?.disconnect(); } catch {}
    streamRef.current?.getTracks().forEach(t => t.stop());
    try { sessionRef.current?.close(); } catch {}
    try { audioContextRef.current?.close(); } catch {}
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    sessionRef.current = null;
    audioContextRef.current = null;
    startedAtRef.current = null;
  }

  async function endSession() {
    const seconds = sessionSeconds || (startedAtRef.current ? Math.floor((Date.now() - startedAtRef.current) / 1000) : 0);
    cleanupAudio();
    setStatus("saving");
    setStatusText("Saving practice summary…");
    const transcript = messagesRef.current.filter(m => m.role !== "system");
    const record = {
      id: crypto.randomUUID(),
      languageId: lang.id,
      language: lang.name,
      mode,
      level: profile.level,
      seconds,
      minutes: Math.max(1, Math.round(seconds / 60)),
      transcript: transcript.slice(-80),
      userTurns: transcript.filter(m => m.role === "you").length,
      coachTurns: transcript.filter(m => m.role === "coach").length,
      createdAtMs: Date.now(),
      createdAt: new Date().toISOString(),
      milestone: seconds >= 300 ? "5-minute immersion milestone achieved" : "Practice session completed",
      score: scoreSession({ minutes: Math.round(seconds / 60), mode })
    };

    const updated = [record, ...readLocalSessions()];
    localStorage.setItem(localKey, JSON.stringify(updated));
    setSessions(updated);

    if (user && db) {
      try {
        const { id, ...data } = record;
        await addDoc(collection(db, "users", user.uid, "sessions"), { ...data, createdAt: serverTimestamp() });
        setCloudNotice("Session successfully synced to your cloud account.");
        await refreshCloudSessions();
      } catch (e) {
        setCloudNotice("Session stored locally. Cloud sync failed (check Firestore rules).");
      }
    } else {
      setCloudNotice("Session saved locally on this device.");
    }

    setStatus("idle");
    setStatusText("Session saved — ready for your next practice");
  }

  async function sendText() {
    const text = textInput.trim();
    if (!text) return;
    setTextInput("");
    addMessage("you", text);
    if (sessionRef.current) {
      sessionRef.current.sendRealtimeInput({ text });
    } else {
      setError("Start a live session before sending a message.");
    }
  }

  const totalMinutes = useMemo(() => {
    return sessions.reduce((sum, s) => sum + (s.minutes || Math.round((s.seconds || 0) / 60)), 0);
  }, [sessions]);

  const languagesPractised = useMemo(() => {
    return new Set(sessions.map(s => s.languageId)).size;
  }, [sessions]);

  const currentLangSessions = useMemo(() => {
    return sessions.filter(s => s.languageId === lang.id);
  }, [sessions, lang.id]);

  const progress = Math.min(100, Math.round((currentLangSessions.length / 12) * 100));

  const streak = useMemo(() => {
    const days = new Set(sessions.map(s => new Date(s.createdAtMs || s.createdAt || Date.now()).toDateString()));
    let count = 0;
    const date = new Date();
    while (days.has(date.toDateString())) {
      count++;
      date.setDate(date.getDate() - 1);
    }
    return count;
  }, [sessions]);

  function exportRecords() {
    const blob = new Blob([JSON.stringify({ profile, sessions, exportedAt: new Date().toISOString() }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `globaltalk-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app-shell">
      {/* Mobile Top Header */}
      <div className="mobile-header">
        <div className="brand">
          <div className="brand-mark"><AudioLines size={22} /></div>
          <div>
            <strong>GlobalTalk AI</strong>
            <span>LANGUAGE STUDIO</span>
          </div>
        </div>
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Main Sidebar Navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <div className="brand desktop-only">
          <div className="brand-mark">
            <AudioLines size={24} />
          </div>
          <div>
            <strong>GlobalTalk AI</strong>
            <span>INTELLIGENT VOICE COACH</span>
          </div>
        </div>

        <div className="sidebar-nav">
          <div className="side-label">WORKSPACE</div>
          <button
            className={`nav-item ${activeTab === "coach" ? "active" : ""}`}
            onClick={() => { setActiveTab("coach"); setMobileMenuOpen(false); }}
          >
            <Mic size={20} />
            <span>Voice Coach</span>
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-item ${activeTab === "progress" ? "active" : ""}`}
            onClick={() => { setActiveTab("progress"); setMobileMenuOpen(false); }}
          >
            <Activity size={20} />
            <span>My Progress</span>
          </button>
          <button
            className={`nav-item ${activeTab === "roadmap" ? "active" : ""}`}
            onClick={() => { setActiveTab("roadmap"); setMobileMenuOpen(false); }}
          >
            <CalendarDays size={20} />
            <span>12-Month Plan</span>
          </button>
          <button
            className={`nav-item ${activeTab === "history" ? "active" : ""}`}
            onClick={() => { setActiveTab("history"); setMobileMenuOpen(false); }}
          >
            <History size={20} />
            <span>Session History</span>
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="goal-card">
            <div className="goal-top">
              <Target size={18} />
              <span>Daily Practice Goal</span>
            </div>
            <div className="goal-number">
              {Math.min(totalMinutes, profile.dailyGoal)}
              <small>/ {profile.dailyGoal} min</small>
            </div>
            <div className="progress-track" aria-label="Practice goal progress">
              <div style={{ width: `${Math.min(100, (totalMinutes / profile.dailyGoal) * 100)}%` }} />
            </div>
            <span className="tiny-info">
              {totalMinutes >= profile.dailyGoal ? "🎉 Goal completed today!" : `${profile.dailyGoal - Math.min(totalMinutes, profile.dailyGoal)} min remaining`}
            </span>
          </div>

          {firebaseConfigured ? (
            <button className="account-button" onClick={() => (user ? signOut(auth) : login())}>
              {user ? <LogOut size={18} /> : <LogIn size={18} />}
              <span>{user ? (user.displayName || "Account Profile") : "Sign in to sync"}</span>
            </button>
          ) : (
            <div className="local-note">
              <ShieldCheck size={16} />
              <span>Local mode · Sessions stored securely in browser</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        {/* Top Header Bar */}
        <header className="topbar">
          <div>
            <span className="eyebrow">PROFESSIONAL MULTILINGUAL STUDIO</span>
            <h1>
              {activeTab === "coach" && "Live Conversational Coach"}
              {activeTab === "progress" && "Practice & Milestone Analytics"}
              {activeTab === "roadmap" && "Global Fluency Roadmap"}
              {activeTab === "history" && "Session Log & Transcripts"}
            </h1>
          </div>

          <div className="top-actions">
            <div className={`status-pill ${status === "connected" ? "online" : status === "connecting" ? "connecting" : ""}`}>
              <span className="pulse-indicator" />
              <strong>{status === "connected" ? "LIVE AUDIO ACTIVE" : status === "connecting" ? "CONNECTING..." : "COACH READY"}</strong>
            </div>
            <button className="icon-button" title="Export session records" onClick={exportRecords} aria-label="Export records">
              <Download size={18} />
            </button>
          </div>
        </header>

        {/* Global Alert / Notice Bar */}
        {cloudNotice && (
          <div className="notice-banner">
            <Info size={18} />
            <span>{cloudNotice}</span>
            <button onClick={() => setCloudNotice("")} aria-label="Close notice">
              <X size={16} />
            </button>
          </div>
        )}

        {/* TAB 1: VOICE COACH */}
        {activeTab === "coach" && (
          <div className="coach-layout">
            <section className="left-column">
              {/* Practice Configuration Panel */}
              <div className="panel session-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">SESSION SETTINGS</span>
                    <h2>Configure Your Practice</h2>
                  </div>
                  <span className="session-chip">
                    <Sparkles size={16} />
                    <span>Real-time Gemini Live</span>
                  </span>
                </div>

                <div className="field-grid">
                  <label className="field full">
                    <span className="field-label">Target Language & Market</span>
                    <div className="select-wrap">
                      <select
                        value={profile.selectedLanguage}
                        onChange={e => setProfile(p => ({ ...p, selectedLanguage: e.target.value }))}
                      >
                        {LANGUAGES.map(l => (
                          <option key={l.id} value={l.id}>
                            {l.flag} {l.name} — ({l.market})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} />
                    </div>
                    <small className="field-hint">
                      <strong>Market focus:</strong> {lang.focus}
                    </small>
                  </label>

                  <label className="field">
                    <span className="field-label">Proficiency Level (CEFR)</span>
                    <div className="select-wrap">
                      <select
                        value={profile.level}
                        onChange={e => setProfile(p => ({ ...p, level: e.target.value }))}
                      >
                        {LEVELS.map(l => (
                          <option key={l} value={l}>
                            {l} — {l === "A0" ? "Absolute Beginner" : l === "A1" ? "Elementary" : l === "A2" ? "Pre-Intermediate" : l === "B1" ? "Intermediate" : l === "B2" ? "Upper Intermediate" : l === "C1" ? "Advanced" : "Mastery"}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} />
                    </div>
                  </label>

                  <label className="field">
                    <span className="field-label">Practice Scenario</span>
                    <div className="select-wrap">
                      <select
                        value={mode}
                        onChange={e => setMode(e.target.value)}
                      >
                        {MODES.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.icon} {m.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={18} />
                    </div>
                  </label>
                </div>

                <div className="toggle-row">
                  <label className="custom-switch">
                    <input
                      type="checkbox"
                      checked={profile.correction}
                      onChange={e => setProfile(p => ({ ...p, correction: e.target.checked }))}
                    />
                    <span className="switch-slider" />
                    <span className="switch-text">Live grammar & phrasing corrections</span>
                  </label>

                  <label className="custom-switch">
                    <input
                      type="checkbox"
                      checked={profile.nativeSupport}
                      onChange={e => setProfile(p => ({ ...p, nativeSupport: e.target.checked }))}
                    />
                    <span className="switch-slider" />
                    <span className="switch-text">English explanations when stuck</span>
                  </label>
                </div>

                <div className="callout">
                  <Brain size={22} />
                  <div>
                    <strong>Proactive AI Voice Interaction</strong>
                    <p>
                      Your coach actively asks questions, models native intonation, and adjusts vocabulary difficulty dynamically as you speak.
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="error-box">
                    <CircleHelp size={20} />
                    <span>{error}</span>
                    <button onClick={() => setError("")} aria-label="Dismiss error">
                      <X size={18} />
                    </button>
                  </div>
                )}

                <div className="session-actions">
                  {status === "connected" ? (
                    <button className="primary-button danger" onClick={endSession}>
                      <Pause size={20} />
                      <span>End & Save Session</span>
                    </button>
                  ) : (
                    <button
                      className="primary-button"
                      disabled={status === "connecting" || status === "saving"}
                      onClick={startSession}
                    >
                      <Mic size={20} />
                      <span>
                        {status === "connecting" ? "Connecting to Live Coach…" : status === "saving" ? "Saving Session…" : "Start Live Voice Session"}
                      </span>
                      <ArrowRight size={18} className="button-arrow" />
                    </button>
                  )}
                  <span className="privacy-badge">
                    <ShieldCheck size={16} />
                    <span>Microphone is strictly active during live conversations</span>
                  </span>
                </div>
              </div>

              {/* Live Conversation Transcript Room */}
              <div className="panel conversation-panel">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">REAL-TIME ROOM</span>
                    <h2>Live Conversation & Audio Feed</h2>
                  </div>
                  <div className="timer-badge">
                    <Clock3 size={16} />
                    <span>
                      {String(Math.floor(sessionSeconds / 60)).padStart(2, "0")}:{String(sessionSeconds % 60).padStart(2, "0")}
                    </span>
                  </div>
                </div>

                <div className="conversation-feed" tabIndex={0} aria-label="Conversation messages">
                  {messages.length === 0 ? (
                    <div className="empty-conversation">
                      <div className="orb">
                        <AudioLines size={32} />
                      </div>
                      <h3>Start speaking with your coach</h3>
                      <p>
                        Press "Start Live Voice Session". Your coach will greet you in {lang.name} and ask your first question out loud.
                      </p>
                      <span className="coach-status-hint">{statusText}</span>
                    </div>
                  ) : (
                    messages.map(m => (
                      <div className={`message-bubble ${m.role}`} key={m.id || `${m.role}-${m.at}`}>
                        <div className="message-avatar">
                          {m.role === "you" ? "YOU" : m.role === "coach" ? "AI" : "SYS"}
                        </div>
                        <div className="message-content">
                          <div className="message-meta">
                            <strong>{m.role === "you" ? "You" : m.role === "coach" ? "GlobalTalk AI Coach" : "Session System"}</strong>
                            <span>{m.at ? new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                          </div>
                          <p>{m.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Text Fallback Interaction */}
                <form className="text-fallback-form" onSubmit={e => { e.preventDefault(); sendText(); }}>
                  <input
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder={status === "connected" ? "Type a reply in the chat if you prefer writing…" : "Text input becomes active when a live session is started"}
                    disabled={status !== "connected"}
                    aria-label="Text message input"
                  />
                  <button
                    type="submit"
                    disabled={status !== "connected" || !textInput.trim()}
                    aria-label="Send message"
                  >
                    <Play size={18} />
                  </button>
                </form>
              </div>
            </section>

            {/* Right Column Intelligence Cards */}
            <section className="right-column">
              {/* Today's Target Card */}
              <div className="panel target-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">SESSION GOAL</span>
                    <h2>
                      {mode === "business" ? "Client Acquisition Call" : mode === "interview" ? "Interview Preparation" : mode === "travel" ? "Travel Scenarios" : mode === "exam" ? "Proficiency Check" : "Everyday Fluency"}
                    </h2>
                  </div>
                  <div className="card-icon-wrap">
                    <Target size={22} />
                  </div>
                </div>
                <p className="card-description">
                  {mode === "business"
                    ? "Practice discovery questions, handling pricing objections, pitching Askus Studio services, and professional negotiation."
                    : mode === "interview"
                    ? "Demonstrate your experience, articulate technical capabilities, and answer behavioral interview questions."
                    : mode === "exam"
                    ? "Answer structured questions one by one. Your coach will evaluate comprehension, grammar, and fluency."
                    : mode === "travel"
                    ? "Learn authentic phrases for dining, navigating transit, checking in, and interacting with locals."
                    : "Speak freely, expand conversational vocabulary, and build immediate speaking confidence."}
                </p>
                <div className="target-checklist">
                  <div className="checklist-item">
                    <CheckCircle2 size={18} />
                    <span>Speak audibly in full sentences</span>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} />
                    <span>Listen and repeat modeled phrasing</span>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} />
                    <span>Save session to update daily milestones</span>
                  </div>
                </div>
              </div>

              {/* Learning Snapshot Card */}
              <div className="panel snapshot-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">YOUR JOURNEY</span>
                    <h2>Practice Analytics</h2>
                  </div>
                  <Globe2 size={22} className="muted-icon" />
                </div>
                <div className="stats-grid">
                  <div className="stat-card">
                    <span className="stat-title">Total Practice</span>
                    <strong className="stat-value">
                      {totalMinutes}
                      <small>min</small>
                    </strong>
                    <span className="stat-sub">Across all sessions</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-title">Sessions</span>
                    <strong className="stat-value">{sessions.length}</strong>
                    <span className="stat-sub">Completed</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-title">Languages</span>
                    <strong className="stat-value">{languagesPractised}</strong>
                    <span className="stat-sub">Explored</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-title">Day Streak</span>
                    <strong className="stat-value">
                      {streak}
                      <Flame size={18} className="streak-flame" />
                    </strong>
                    <span className="stat-sub">Days active</span>
                  </div>
                </div>
              </div>

              {/* Current Milestone Progress Card */}
              <div className="panel milestone-card">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">MILESTONE TRACKER</span>
                    <h2>{lang.name}</h2>
                  </div>
                  <span className="level-badge">{profile.level}</span>
                </div>
                <div className="milestone-progress-bar">
                  <div className="progress-track">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <span className="progress-percentage">{progress}%</span>
                </div>
                <p className="card-description">
                  {currentLangSessions.length} of 12 target sessions logged toward your next CEFR proficiency milestone.
                </p>
                <div className="milestone-badge-box">
                  <Award size={20} />
                  <span>Next milestone: Complete 12 sessions for formal progress assessment.</span>
                </div>
              </div>

              {/* Coach Pro-Tip */}
              <div className="panel coach-tip-card">
                <div className="tip-icon-box">
                  <Volume2 size={22} />
                </div>
                <div>
                  <strong>Voice Coach Best Practice</strong>
                  <p>
                    Wear headphones to eliminate room echo. Do not fear making grammatical errors — formulating sentences spontaneously builds speaking fluency fastest.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: MY PROGRESS */}
        {activeTab === "progress" && (
          <div className="progress-page">
            <div className="panel hero-panel">
              <span className="eyebrow">COMPREHENSIVE OVERVIEW</span>
              <h2>Your Speaking & Fluency Progress</h2>
              <div className="big-stats-container">
                <div className="big-stat-item">
                  <strong>{totalMinutes}</strong>
                  <span>Total Minutes Practiced</span>
                </div>
                <div className="big-stat-item">
                  <strong>{sessions.length}</strong>
                  <span>Voice Sessions Completed</span>
                </div>
                <div className="big-stat-item">
                  <strong>{languagesPractised}</strong>
                  <span>Languages Explored</span>
                </div>
                <div className="big-stat-item">
                  <strong>{streak}</strong>
                  <span>Consecutive Day Streak</span>
                </div>
              </div>
              <p className="hero-description">
                GlobalTalk AI measures conversational turn count, speaking duration, and daily consistency. Every completed conversation builds real acoustic familiarity and natural language reflexes.
              </p>
              <div className="hero-actions">
                <button className="primary-button secondary-style" onClick={exportRecords}>
                  <Download size={18} />
                  <span>Export Progress Summary (JSON)</span>
                </button>
              </div>
            </div>

            <div className="panel languages-breakdown-panel">
              <span className="eyebrow">CURRICULUM BREAKDOWN</span>
              <h2>Practice by Language & Market</h2>
              <div className="language-list">
                {LANGUAGES.map(l => {
                  const langSessions = sessions.filter(s => s.languageId === l.id);
                  const count = langSessions.length;
                  const mins = langSessions.reduce((acc, curr) => acc + (curr.minutes || 0), 0);
                  const pct = Math.min(100, Math.round((count / 12) * 100));
                  return (
                    <div className="language-card-row" key={l.id}>
                      <span className="lang-flag">{l.flag}</span>
                      <div className="lang-details">
                        <div className="lang-title-row">
                          <strong>{l.name}</strong>
                          <span className="lang-market-tag">{l.market}</span>
                        </div>
                        <div className="progress-track">
                          <div style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="lang-stat-numbers">
                        <strong>{count} / 12</strong>
                        <small>{mins} min logged</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 12-MONTH ROADMAP */}
        {activeTab === "roadmap" && (
          <div className="roadmap-container">
            <div className="panel roadmap-hero">
              <span className="eyebrow">STRATEGIC CURRICULUM</span>
              <h2>12-Month International Business Fluency Plan</h2>
              <p className="card-description">
                Structured for steady progression of ~90 minutes per day, six days per week. Move progressively from foundational greetings to pitch presentations and client contract negotiations.
              </p>
            </div>

            <div className="roadmap-cards-grid">
              {ROADMAP.map(r => (
                <article className="roadmap-card-item" key={r.month}>
                  <div className="month-badge">Month {String(r.month).padStart(2, "0")}</div>
                  <div className="roadmap-card-content">
                    <span className="roadmap-languages">{r.languages}</span>
                    <h3>{r.title}</h3>
                    <p>{r.milestone}</p>
                    <div className="roadmap-milestone-tag">
                      <Target size={15} />
                      <span>Key Milestone</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SESSION HISTORY */}
        {activeTab === "history" && (
          <div className="panel history-page-panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">ACTIVITY ARCHIVE</span>
                <h2>Saved Practice Sessions</h2>
              </div>
              <button className="primary-button secondary-style small" onClick={exportRecords}>
                <Download size={16} />
                <span>Export JSON</span>
              </button>
            </div>

            <div className="history-sync-note">
              <ShieldCheck size={18} />
              <span>
                {cloudNotice || (user ? `Cloud sync active for account: ${user.email || user.displayName}` : "Sessions are securely saved locally in this browser. Sign in with Google to sync across all your devices.")}
              </span>
            </div>

            {sessions.length === 0 ? (
              <div className="empty-history-state">
                <History size={48} />
                <h3>No sessions logged yet</h3>
                <p>When you complete and save a live voice conversation, full transcripts and practice metrics will appear here.</p>
              </div>
            ) : (
              <div className="history-item-list">
                {sessions.map(s => {
                  const langItem = LANGUAGES.find(l => l.id === s.languageId);
                  const modeItem = MODES.find(m => m.id === s.mode);
                  return (
                    <div className="history-card" key={s.id}>
                      <div className="history-flag-box">{langItem?.flag || "🌐"}</div>
                      <div className="history-main-content">
                        <div className="history-title-line">
                          <strong>{s.language} · {modeItem?.label || s.mode}</strong>
                          <span className="history-level-tag">Level {s.level}</span>
                        </div>
                        <span className="history-time-meta">
                          {new Date(s.createdAtMs || s.createdAt || Date.now()).toLocaleDateString([], {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric"
                          })} at {new Date(s.createdAtMs || s.createdAt || Date.now()).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                        </span>
                        <div className="history-stats-pills">
                          <span>{s.userTurns || 0} user turns</span>
                          <span>{s.coachTurns || 0} coach turns</span>
                          <span>{s.milestone || "Session completed"}</span>
                        </div>
                      </div>
                      <div className="history-time-pill">
                        <strong>{s.minutes || 0}</strong>
                        <span>min</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Global Footer */}
        <footer className="app-footer">
          <div>
            <strong>GlobalTalk AI</strong> · Voice-First Language Intelligence Platform
          </div>
          <div>
            Enterprise Build · Powered by Google Gemini Live API
          </div>
        </footer>
      </main>
    </div>
  );
}
