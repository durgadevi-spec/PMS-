import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/Layout";
import { apiFetch } from "@/lib/apiClient";
import { Loader2, ArrowLeft } from "lucide-react";
import LoginScene, { SceneState } from "@/components/LoginScene";

export default function Login() {
  const { login } = useAuth();

  // ---- Card Flip State (3D Coin Rotation) ----
  const [isFlipped, setIsFlipped] = useState(false);

  // ---- Login Form state ----
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // ---- Forgot password Form state ----
  const [resetEmployeeCode, setResetEmployeeCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  // ---- Scene state for characters ----
  const [sceneState, setSceneState] = useState<SceneState>("idle");
  const empCodeRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const wrongTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ---- Remember me: restore employee code only (never password) ----
  useEffect(() => {
    const remembered = localStorage.getItem("remembered_emp_code");
    if (remembered) {
      setEmployeeCode(remembered);
      setRememberMe(true);
    }
  }, []);

  // ---- Scene state transitions for Login ----
  function handleEmpCodeFocus() {
    if (sceneState === "wrong") return;
    setSceneState(employeeCode.length > 0 ? "typing" : "email");
  }
  function handleEmpCodeChange(v: string) {
    setEmployeeCode(v);
    if (sceneState !== "wrong") {
      setSceneState(v.length > 0 ? "typing" : "email");
    }
  }
  function handleEmpCodeBlur() {
    if (sceneState !== "wrong") setSceneState(isFlipped ? "forgot" : "idle");
  }
  function handlePwFocus() {
    if (sceneState !== "wrong") {
      setSceneState(showPassword ? "show" : "pwd");
    }
  }
  function handlePwBlur() {
    if (sceneState !== "wrong") setSceneState(isFlipped ? "forgot" : "idle");
  }
  function handlePwChange(v: string) {
    setPassword(v);
    setErrorMessage("");
  }
  function handleTogglePassword() {
    const next = !showPassword;
    setShowPassword(next);
    if (next) {
      setSceneState("show");
    } else {
      setSceneState("hide");
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        if (document.activeElement === pwRef.current) setSceneState("pwd");
      }, 1650);
    }
    pwRef.current?.focus();
  }
  function handleToggleNewPassword() {
    const next = !showNewPassword;
    setShowNewPassword(next);
    if (next) {
      setSceneState("show");
    } else {
      setSceneState("hide");
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setSceneState(isFlipped ? "forgot" : "idle");
      }, 1650);
    }
  }
  function handleToggleConfirmPassword() {
    const next = !showConfirmPassword;
    setShowConfirmPassword(next);
    if (next) {
      setSceneState("show");
    } else {
      setSceneState("hide");
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        setSceneState(isFlipped ? "forgot" : "idle");
      }, 1650);
    }
  }
  function triggerWrong() {
    setSceneState("wrong");
    clearTimeout(wrongTimerRef.current);
    wrongTimerRef.current = setTimeout(() => {
      setSceneState(isFlipped ? "forgot" : "idle");
    }, 2050);
  }

  // ---- Flip Card Handlers ----
  function flipToForgot() {
    setIsFlipped(true);
    setResetError("");
    setResetSuccess("");
    setSceneState("forgot");
  }

  function flipToLogin() {
    setIsFlipped(false);
    setErrorMessage("");
    setSceneState("idle");
  }

  // ---- Login submit ----
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    if (!employeeCode.trim()) {
      setErrorMessage("Please enter your employee code");
      triggerWrong();
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password");
      triggerWrong();
      return;
    }
    setIsLoading(true);

    if (rememberMe) {
      localStorage.setItem("remembered_emp_code", employeeCode);
    } else {
      localStorage.removeItem("remembered_emp_code");
    }

    login(employeeCode, password)
      .then(() => {
        setIsLoading(false);
      })
      .catch((err: any) => {
        setErrorMessage(err?.message || "Invalid credentials");
        setIsLoading(false);
        triggerWrong();
      });
  };

  // ---- Forgot password submit ----
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");

    if (!resetEmployeeCode.trim() || !newPassword || !confirmPassword) {
      setResetError("Please fill all fields");
      triggerWrong();
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match");
      triggerWrong();
      return;
    }
    setResetLoading(true);
    try {
      const res = await apiFetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode: resetEmployeeCode.trim(), newPassword, confirmPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to reset password" }));
        throw new Error(data.error || "Failed to reset password");
      }
      setResetSuccess("Password updated successfully!");
      setSceneState("success");

      // Auto-flip back to login after celebrating
      setTimeout(() => {
        setIsFlipped(false);
        setResetEmployeeCode("");
        setNewPassword("");
        setConfirmPassword("");
        setResetSuccess("");
        setSceneState("idle");
      }, 1600);
    } catch (err: any) {
      setResetError(err.message || "Failed to reset password");
      triggerWrong();
    } finally {
      setResetLoading(false);
    }
  };

  const activeTypingLen = isFlipped ? resetEmployeeCode.length : employeeCode.length;

  return (
    <>
      {/* ---- Unified Light Grey Page Canvas ---- */}
      <div
        className="login-container"
        style={{
          minHeight: "100vh",
          width: "100%",
          background: "#e8e8e8",
          fontFamily: "'Poppins', system-ui, sans-serif",
          display: "grid",
          gridTemplateColumns: "1.15fr 1fr",
          alignItems: "stretch",
          padding: "16px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* -------- LEFT: Grounded Characters on Canvas -------- */}
        <section
          className="login-characters-section"
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            position: "relative",
            paddingBottom: "0px",
            minHeight: "460px",
            overflow: "visible",
          }}
        >
          <LoginScene sceneState={sceneState} typingLen={activeTypingLen} />
        </section>

        {/* -------- RIGHT: 3D Flipping Card Container -------- */}
        <section
          className="login-flipper-container"
          style={{
            perspective: "1200px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
          }}
        >
          <div
            className="login-coin-card"
            style={{
              position: "relative",
              width: "min(100%, 510px)",
              height: "calc(100vh - 32px)",
              maxHeight: "700px",
              minHeight: "600px",
              transformStyle: "preserve-3d",
              transition: "transform 0.75s cubic-bezier(0.34, 1.45, 0.64, 1)",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* ============================================================ */}
            {/* FRONT FACE: LOG IN FORM                                     */}
            {/* ============================================================ */}
            <div
              className="login-card-face login-card-front"
              style={{
                position: "absolute",
                inset: 0,
                background: "#ffffff",
                borderRadius: "28px",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(0deg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "44px 36px",
                boxShadow: "0 10px 40px -10px rgba(0, 0, 0, 0.06)",
                boxSizing: "border-box",
                overflowY: "auto",
              }}
            >
              {/* Star Logo */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
                <svg viewBox="0 0 24 24" style={{ width: 32, height: 32 }} aria-hidden="true">
                  <path fill="#1b1c1f" d="M12 0.5 C13.8 6 14.2 9.5 23.5 12 C14.2 14.5 13.8 18 12 23.5 C10.2 18 9.8 14.5 0.5 12 C9.8 9.5 10.2 6 12 0.5Z" />
                </svg>
              </div>

              {/* Heading */}
              <h1
                style={{
                  fontSize: "clamp(26px, 2.3vw, 34px)",
                  fontWeight: 700,
                  marginTop: "16px",
                  letterSpacing: ".2px",
                  textAlign: "center",
                  color: "#1b1c1f",
                  lineHeight: 1.2,
                }}
              >
                Welcome back!
              </h1>
              <p style={{ fontSize: "13px", marginTop: "8px", color: "#6e6e73", textAlign: "center" }}>
                Please enter your details
              </p>

              {/* Form */}
              <form
                onSubmit={handleLogin}
                style={{ width: "min(88%, 410px)", marginTop: "32px" }}
                noValidate
                autoComplete="off"
              >
                {/* Employee Code field */}
                <div
                  id="empCodeWrapper"
                  style={{
                    position: "relative",
                    height: 56,
                    borderBottom: `1.5px solid ${errorMessage && !password ? "#ff4d00" : "#d1d1d6"}`,
                    marginBottom: 16,
                    transition: "border-color .25s",
                  }}
                  onFocus={() => {
                    const el = document.getElementById("empCodeWrapper");
                    if (el) el.style.borderBottomColor = "#1b1c1f";
                  }}
                  onBlur={() => {
                    const el = document.getElementById("empCodeWrapper");
                    if (el) el.style.borderBottomColor = errorMessage && !password ? "#ff4d00" : "#d1d1d6";
                  }}
                >
                  <input
                    ref={empCodeRef}
                    id="empCode"
                    type="text"
                    placeholder=" "
                    autoComplete="off"
                    spellCheck={false}
                    value={employeeCode}
                    onFocus={handleEmpCodeFocus}
                    onBlur={handleEmpCodeBlur}
                    onChange={e => handleEmpCodeChange(e.target.value)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      border: 0,
                      outline: 0,
                      background: "transparent",
                      font: "400 16px 'Poppins', sans-serif",
                      color: "#1b1c1f",
                      padding: "22px 0 4px 0",
                      letterSpacing: ".2px",
                    }}
                  />
                  <label
                    htmlFor="empCode"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: employeeCode ? "4px" : "18px",
                      fontSize: employeeCode ? "11px" : "14px",
                      fontWeight: 500,
                      pointerEvents: "none",
                      color: errorMessage && !password ? "#ff4d00" : "#77777b",
                      transition: "all .25s ease-out",
                    }}
                  >
                    Employee Code
                  </label>
                </div>

                {/* Password field */}
                <div
                  id="pwWrapper"
                  style={{
                    position: "relative",
                    height: 56,
                    borderBottom: `1.5px solid ${errorMessage && !employeeCode ? "#ff4d00" : "#d1d1d6"}`,
                    marginBottom: 16,
                    transition: "border-color .25s",
                  }}
                  onFocus={() => {
                    const el = document.getElementById("pwWrapper");
                    if (el) el.style.borderBottomColor = "#1b1c1f";
                  }}
                  onBlur={() => {
                    const el = document.getElementById("pwWrapper");
                    if (el) el.style.borderBottomColor = errorMessage && !employeeCode ? "#ff4d00" : "#d1d1d6";
                  }}
                >
                  <input
                    ref={pwRef}
                    id="pw"
                    type={showPassword ? "text" : "password"}
                    placeholder=" "
                    autoComplete="off"
                    spellCheck={false}
                    value={password}
                    onFocus={handlePwFocus}
                    onBlur={handlePwBlur}
                    onChange={e => handlePwChange(e.target.value)}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      border: 0,
                      outline: 0,
                      background: "transparent",
                      font: "400 16px 'Poppins', sans-serif",
                      color: "#1b1c1f",
                      padding: "22px 36px 4px 0",
                      letterSpacing: ".2px",
                    }}
                  />
                  <label
                    htmlFor="pw"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: password ? "4px" : "18px",
                      fontSize: password ? "11px" : "14px",
                      fontWeight: 500,
                      pointerEvents: "none",
                      color: errorMessage && !employeeCode ? "#ff4d00" : "#77777b",
                      transition: "all .25s ease-out",
                    }}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    aria-label="Toggle password visibility"
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleTogglePassword}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 22,
                      width: 26,
                      height: 22,
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                    }}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 20 20" fill="none" stroke="#1b1c1f" strokeWidth={1.8} strokeLinecap="round" style={{ width: 20, height: 20 }}>
                        <path d="M2 8 Q10 15 18 8" /><path d="M5 11.6 L3.6 14" /><path d="M10 13.2 V16" /><path d="M15 11.6 L16.4 14" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" style={{ width: 20, height: 20 }}>
                        <path fill="#1b1c1f" d="M1 10 Q10 2 19 10 Q10 18 1 10Z" /><circle cx={11.5} cy={10} r={3} fill="#fff" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Remember me + Forgot password row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                    marginTop: "10px",
                    marginBottom: "28px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      userSelect: "none",
                      color: "#6e6e73",
                      fontSize: "12px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      style={{ display: "none" }}
                    />
                    <span
                      style={{
                        width: 15,
                        height: 15,
                        border: "1.4px solid #1b1c1f",
                        borderRadius: 4,
                        display: "grid",
                        placeItems: "center",
                        background: rememberMe ? "#1b1c1f" : "transparent",
                        transition: "all .2s ease",
                        flexShrink: 0,
                      }}
                    >
                      {rememberMe && (
                        <svg viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: 9, height: 9 }}>
                          <path d="M1.5 5.2 L4 7.6 L8.5 2.4" />
                        </svg>
                      )}
                    </span>
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={flipToForgot}
                    style={{
                      color: "#86868b",
                      textDecoration: "none",
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      fontSize: "12px",
                      fontFamily: "'Poppins', sans-serif",
                      transition: "color .2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#1b1c1f")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#86868b")}
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Error message */}
                {errorMessage && (
                  <div
                    style={{
                      marginBottom: "16px",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "#fff0ee",
                      border: "1px solid #ffb8a8",
                    }}
                  >
                    <p style={{ fontSize: "12px", color: "#cc2200", margin: 0, textAlign: "center" }}>
                      {errorMessage}
                    </p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    height: 50,
                    border: 0,
                    borderRadius: 999,
                    cursor: isLoading ? "not-allowed" : "pointer",
                    font: "600 13px 'Poppins', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: "#1b1c1f",
                    color: "#fff",
                    opacity: isLoading ? 0.75 : 1,
                    transition: "transform .2s cubic-bezier(.34,1.45,.64,1), background .2s, opacity .2s",
                  }}
                  onMouseDown={e => {
                    if (!isLoading) (e.currentTarget as HTMLButtonElement).style.transform = "scale(.98)";
                  }}
                  onMouseUp={e => {
                    if (!isLoading) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Log In"
                  )}
                </button>
              </form>
            </div>

            {/* ============================================================ */}
            {/* BACK FACE: FORGOT / RESET PASSWORD FORM (Coin Flip Side)     */}
            {/* ============================================================ */}
            <div
              className="login-card-face login-card-back"
              style={{
                position: "absolute",
                inset: 0,
                background: "#ffffff",
                borderRadius: "28px",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "36px 36px",
                boxShadow: "0 10px 40px -10px rgba(0, 0, 0, 0.06)",
                boxSizing: "border-box",
                overflowY: "auto",
              }}
            >
              {/* Back to Login button */}
              <div style={{ width: "min(88%, 410px)", display: "flex", alignItems: "center", marginBottom: "8px" }}>
                <button
                  type="button"
                  onClick={flipToLogin}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: 0,
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#86868b",
                    fontFamily: "'Poppins', sans-serif",
                    fontWeight: 500,
                    padding: 0,
                    transition: "color .2s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#1b1c1f")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#86868b")}
                >
                  <ArrowLeft size={15} /> Back to Log In
                </button>
              </div>

              {/* Heading */}
              <h1
                style={{
                  fontSize: "clamp(24px, 2.2vw, 30px)",
                  fontWeight: 700,
                  marginTop: "8px",
                  letterSpacing: ".2px",
                  textAlign: "center",
                  color: "#1b1c1f",
                  lineHeight: 1.2,
                }}
              >
                Reset Password
              </h1>
              <p style={{ fontSize: "12px", marginTop: "6px", color: "#6e6e73", textAlign: "center" }}>
                Enter your employee code to set a new password
              </p>

              {/* Form */}
              <form
                onSubmit={handlePasswordReset}
                style={{ width: "min(88%, 410px)", marginTop: "24px" }}
                noValidate
                autoComplete="off"
              >
                {/* Reset Employee Code */}
                <div
                  id="resetEmpCodeWrapper"
                  style={{
                    position: "relative",
                    height: 52,
                    borderBottom: "1.5px solid #d1d1d6",
                    marginBottom: 14,
                    transition: "border-color .25s",
                  }}
                  onFocus={() => {
                    const el = document.getElementById("resetEmpCodeWrapper");
                    if (el) el.style.borderBottomColor = "#1b1c1f";
                  }}
                  onBlur={() => {
                    const el = document.getElementById("resetEmpCodeWrapper");
                    if (el) el.style.borderBottomColor = "#d1d1d6";
                  }}
                >
                  <input
                    id="resetEmpCode"
                    type="text"
                    placeholder=" "
                    autoComplete="off"
                    spellCheck={false}
                    value={resetEmployeeCode}
                    onFocus={() => {
                      if (sceneState !== "wrong") setSceneState(resetEmployeeCode.length > 0 ? "typing" : "email");
                    }}
                    onBlur={() => {
                      if (sceneState !== "wrong") setSceneState(isFlipped ? "forgot" : "idle");
                    }}
                    onChange={e => {
                      setResetEmployeeCode(e.target.value);
                      setResetError("");
                      if (sceneState !== "wrong") setSceneState(e.target.value.length > 0 ? "typing" : "email");
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      border: 0,
                      outline: 0,
                      background: "transparent",
                      font: "400 15px 'Poppins', sans-serif",
                      color: "#1b1c1f",
                      padding: "20px 0 4px 0",
                      letterSpacing: ".2px",
                    }}
                  />
                  <label
                    htmlFor="resetEmpCode"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: resetEmployeeCode ? "4px" : "16px",
                      fontSize: resetEmployeeCode ? "11px" : "13px",
                      fontWeight: 500,
                      pointerEvents: "none",
                      color: "#77777b",
                      transition: "all .25s ease-out",
                    }}
                  >
                    Employee Code
                  </label>
                </div>

                {/* New Password */}
                <div
                  id="newPwWrapper"
                  style={{
                    position: "relative",
                    height: 52,
                    borderBottom: "1.5px solid #d1d1d6",
                    marginBottom: 14,
                    transition: "border-color .25s",
                  }}
                  onFocus={() => {
                    const el = document.getElementById("newPwWrapper");
                    if (el) el.style.borderBottomColor = "#1b1c1f";
                  }}
                  onBlur={() => {
                    const el = document.getElementById("newPwWrapper");
                    if (el) el.style.borderBottomColor = "#d1d1d6";
                  }}
                >
                  <input
                    id="newPw"
                    type={showNewPassword ? "text" : "password"}
                    placeholder=" "
                    autoComplete="off"
                    spellCheck={false}
                    value={newPassword}
                    onFocus={() => {
                      if (sceneState !== "wrong") setSceneState(showNewPassword ? "show" : "pwd");
                    }}
                    onBlur={() => {
                      if (sceneState !== "wrong") setSceneState(isFlipped ? "forgot" : "idle");
                    }}
                    onChange={e => {
                      setNewPassword(e.target.value);
                      setResetError("");
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      border: 0,
                      outline: 0,
                      background: "transparent",
                      font: "400 15px 'Poppins', sans-serif",
                      color: "#1b1c1f",
                      padding: "20px 36px 4px 0",
                      letterSpacing: ".2px",
                    }}
                  />
                  <label
                    htmlFor="newPw"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: newPassword ? "4px" : "16px",
                      fontSize: newPassword ? "11px" : "13px",
                      fontWeight: 500,
                      pointerEvents: "none",
                      color: "#77777b",
                      transition: "all .25s ease-out",
                    }}
                  >
                    New Password
                  </label>
                  <button
                    type="button"
                    aria-label="Toggle new password visibility"
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleToggleNewPassword}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 18,
                      width: 26,
                      height: 22,
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                    }}
                  >
                    {showNewPassword ? (
                      <svg viewBox="0 0 20 20" fill="none" stroke="#1b1c1f" strokeWidth={1.8} strokeLinecap="round" style={{ width: 18, height: 18 }}>
                        <path d="M2 8 Q10 15 18 8" /><path d="M5 11.6 L3.6 14" /><path d="M10 13.2 V16" /><path d="M15 11.6 L16.4 14" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" style={{ width: 18, height: 18 }}>
                        <path fill="#1b1c1f" d="M1 10 Q10 2 19 10 Q10 18 1 10Z" /><circle cx={11.5} cy={10} r={3} fill="#fff" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Confirm Password */}
                <div
                  id="confirmPwWrapper"
                  style={{
                    position: "relative",
                    height: 52,
                    borderBottom: "1.5px solid #d1d1d6",
                    marginBottom: 20,
                    transition: "border-color .25s",
                  }}
                  onFocus={() => {
                    const el = document.getElementById("confirmPwWrapper");
                    if (el) el.style.borderBottomColor = "#1b1c1f";
                  }}
                  onBlur={() => {
                    const el = document.getElementById("confirmPwWrapper");
                    if (el) el.style.borderBottomColor = "#d1d1d6";
                  }}
                >
                  <input
                    id="confirmPw"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder=" "
                    autoComplete="off"
                    spellCheck={false}
                    value={confirmPassword}
                    onFocus={() => {
                      if (sceneState !== "wrong") setSceneState(showConfirmPassword ? "show" : "pwd");
                    }}
                    onBlur={() => {
                      if (sceneState !== "wrong") setSceneState(isFlipped ? "forgot" : "idle");
                    }}
                    onChange={e => {
                      setConfirmPassword(e.target.value);
                      setResetError("");
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      border: 0,
                      outline: 0,
                      background: "transparent",
                      font: "400 15px 'Poppins', sans-serif",
                      color: "#1b1c1f",
                      padding: "20px 36px 4px 0",
                      letterSpacing: ".2px",
                    }}
                  />
                  <label
                    htmlFor="confirmPw"
                    style={{
                      position: "absolute",
                      left: 0,
                      top: confirmPassword ? "4px" : "16px",
                      fontSize: confirmPassword ? "11px" : "13px",
                      fontWeight: 500,
                      pointerEvents: "none",
                      color: "#77777b",
                      transition: "all .25s ease-out",
                    }}
                  >
                    Confirm Password
                  </label>
                  <button
                    type="button"
                    aria-label="Toggle confirm password visibility"
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleToggleConfirmPassword}
                    style={{
                      position: "absolute",
                      right: 0,
                      top: 18,
                      width: 26,
                      height: 22,
                      background: "none",
                      border: 0,
                      cursor: "pointer",
                      display: "grid",
                      placeItems: "center",
                      padding: 0,
                    }}
                  >
                    {showConfirmPassword ? (
                      <svg viewBox="0 0 20 20" fill="none" stroke="#1b1c1f" strokeWidth={1.8} strokeLinecap="round" style={{ width: 18, height: 18 }}>
                        <path d="M2 8 Q10 15 18 8" /><path d="M5 11.6 L3.6 14" /><path d="M10 13.2 V16" /><path d="M15 11.6 L16.4 14" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" style={{ width: 18, height: 18 }}>
                        <path fill="#1b1c1f" d="M1 10 Q10 2 19 10 Q10 18 1 10Z" /><circle cx={11.5} cy={10} r={3} fill="#fff" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Reset Error banner */}
                {resetError && (
                  <div
                    style={{
                      marginBottom: "14px",
                      padding: "9px 12px",
                      borderRadius: 10,
                      background: "#fff0ee",
                      border: "1px solid #ffb8a8",
                    }}
                  >
                    <p style={{ fontSize: "12px", color: "#cc2200", margin: 0, textAlign: "center" }}>
                      {resetError}
                    </p>
                  </div>
                )}

                {/* Reset Success banner */}
                {resetSuccess && (
                  <div
                    style={{
                      marginBottom: "14px",
                      padding: "9px 12px",
                      borderRadius: 10,
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                    }}
                  >
                    <p style={{ fontSize: "12px", color: "#065f46", margin: 0, textAlign: "center", fontWeight: 500 }}>
                      🎉 {resetSuccess}
                    </p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={resetLoading}
                  style={{
                    width: "100%",
                    height: 48,
                    border: 0,
                    borderRadius: 999,
                    cursor: resetLoading ? "not-allowed" : "pointer",
                    font: "600 13px 'Poppins', sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    background: "#1b1c1f",
                    color: "#fff",
                    opacity: resetLoading ? 0.75 : 1,
                    transition: "transform .2s cubic-bezier(.34,1.45,.64,1), background .2s, opacity .2s",
                  }}
                >
                  {resetLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>

      {/* ---- Responsive Layout CSS ---- */}
      <style>{`
        @media (max-width: 860px) {
          .login-container {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto auto !important;
            min-height: auto !important;
            height: auto !important;
            padding: 12px !important;
          }
          .login-characters-section {
            height: 240px !important;
            min-height: 240px !important;
            align-items: flex-end !important;
          }
          .login-characters-section svg {
            width: min(90%, 340px) !important;
            height: auto !important;
          }
          .login-coin-card {
            max-height: none !important;
            min-height: 520px !important;
            height: 560px !important;
          }
          .login-card-face {
            padding: 32px 20px !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .login-container *, .login-container *::before, .login-container *::after {
            transition-duration: .01ms !important;
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}
