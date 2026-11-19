import { useEffect, useRef, useState, useCallback } from "react";

export type SceneState = "idle" | "email" | "typing" | "pwd" | "hide" | "show" | "wrong" | "forgot" | "success";

interface LoginSceneProps {
  sceneState: SceneState;
  typingLen?: number;
}

export default function LoginScene({ sceneState, typingLen = 0 }: LoginSceneProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stateRef = useRef<SceneState>("idle");
  const typingLenRef = useRef<number>(0);
  typingLenRef.current = typingLen;
  stateRef.current = sceneState;

  const [isEntering, setIsEntering] = useState(() => {
    if (typeof window !== "undefined") {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });
  const isEnteringRef = useRef(isEntering);
  isEnteringRef.current = isEntering;

  useEffect(() => {
    if (!isEntering) return;
    const t = setTimeout(() => {
      setIsEntering(false);
      isEnteringRef.current = false;
    }, 1550);
    return () => clearTimeout(t);
  }, [isEntering]);

  const mouseRef = useRef({ x: 0, y: 0 });
  const mwRef = useRef({ c: 0, a: 0 });
  const ymCurRef = useRef(0);
  const rafRef = useRef<number>(0);
  const wrongUntilRef = useRef(0);
  const hideUntilRef = useRef(0);
  const reduceRef = useRef(false);

  // ---- Purple path morph constants ----
  const N = 12;
  const H = 249;
  const rangeArr = (n: number) => Array.from({ length: n + 1 }, (_, i) => i);
  const S_L = rangeArr(N).map(i => [78, 251 - i * H / N]);
  const S_R = rangeArr(N).map(j => [192, 2 + j * H / N]);
  const C_L = rangeArr(N).map(i => { const t = i / N; return [78 + 30 * t * t, 251 - i * H / N]; });
  const C_R = rangeArr(N).map(j => { const t = (N - j) / N; return [192 + 30 * t * t, 2 + j * H / N]; });
  const resample = (a: number[][], n: number) => rangeArr(n).map(i => {
    const pos = i / n * (a.length - 1), k = Math.min(Math.floor(pos), a.length - 2), f = pos - k;
    return [a[k][0] + (a[k + 1][0] - a[k][0]) * f, a[k][1] + (a[k + 1][1] - a[k][1]) * f];
  });
  const A_L = resample([[110, 251], [102, 207], [93, 163], [70, 125], [55, 98], [66, 48], [80, 0]], N);
  const A_R = resample([[195, 25], [188, 55], [180, 83], [190, 103], [198, 123], [200, 190], [202, 251]], N);
  const SHAPES = [[...S_L, ...S_R], [...C_L, ...C_R], [...A_L, ...A_R]];

  // ---- Eye look targets per state ----
  const LK: Record<string, Record<string, number[]>> = {
    email:  { p: [1, .5],   b: [1, .6],   y: [1, .5],  o: [1, .6] },
    typing: { p: [1, .7],   b: [1, .9],   y: [1, .7],  o: [1, .8] },
    pwd:    { p: [1, .3],   b: [1, .2],   y: [1, .2],  o: [1, .3] },
    hide:   { p: [.4, .2],  b: [0, .15],  y: [0, 0],   o: [.3, .2] },
    wrong:  { p: [0, .4],   b: [-.5, -.5], y: [0, .5], o: [0, .5] },
    show:   { p: [-1, -.8], b: [-.3, -1], y: [-1, -.3], o: [0, 0] },
    success: { p: [0, -0.4], b: [0, -0.4], y: [0, -0.2], o: [0, -0.3] },
  };

  const getParams = useCallback((s: SceneState, tLen: number) => {
    const n = Math.min(tLen, 24) / 24;
    switch (s) {
      case "email":   return { lean: [5, 4, 3],                 wc: .12,        wa: 0, look: LK.email,   ym: .7 };
      case "typing":  return { lean: [6 + 6 * n, 4 + 4 * n, 3 + 3 * n], wc: .3 + .7 * n, wa: 0, look: LK.typing, ym: .8 };
      case "pwd":     return { lean: [3, 2.5, 2],                wc: .05,        wa: 0, look: LK.pwd,     ym: .5 };
      case "hide":    return { lean: [2, 1.5, 1],                wc: 0,          wa: 0, look: LK.hide,    ym: 0 };
      case "wrong":   return { lean: [0, 0, 0],                  wc: 0,          wa: 1, look: LK.wrong,   ym: 0 };
      case "show":    return { lean: [0, 0, 0],                  wc: 0,          wa: 0, look: LK.show,    ym: 0 };
      case "forgot":  return { lean: [3, 2, 1],                  wc: .1,         wa: 0, look: null,        ym: null }; // look: null allows dynamic mouse cursor eye tracking
      case "success": return { lean: [2, 1, 0],                  wc: .05,        wa: 0, look: LK.success, ym: .2 };
      default:        return { lean: [0, 0, 0],                  wc: 0,          wa: 0, look: null,        ym: null };
    }
  }, []);

  useEffect(() => {
    reduceRef.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const onPointerMove = (e: PointerEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onPointerMove);

    const svg = svgRef.current;
    if (!svg) return;

    const $ = (sel: string, root: Element | Document = document) =>
      root.querySelector(sel) as Element | null;

    const pBody = $("#pBody", svg) as SVGPathElement | null;
    const pFace = $("#pFace", svg) as SVGGElement | null;
    const gP    = $("#gP",    svg) as SVGGElement | null;
    const gB    = $("#gB",    svg) as SVGGElement | null;
    const gY    = $("#gY",    svg) as SVGGElement | null;
    const yMouth = $("#yMouth", svg) as SVGGElement | null;
    const yBody  = $("#yBody",  svg) as SVGPathElement | null;
    const shows = [...svg.querySelectorAll("[data-show]")] as SVGElement[];
    const bodies = [gP, gB, gY].filter(Boolean) as SVGGElement[];

    interface EyeData {
      w: SVGCircleElement;
      p: SVGCircleElement;
      key: string;
      max: number;
      x: number;
      y: number;
    }
    const eyes: EyeData[] = [...svg.querySelectorAll(".login-scene-eye")].map(g => ({
      w: g.querySelector(".w") as SVGCircleElement,
      p: g.querySelector(".p") as SVGCircleElement,
      key: (g as SVGElement).dataset.c || "",
      max: parseFloat((g as SVGElement).dataset.max || "3"),
      x: 0,
      y: 0,
    }));

    function drawPurple() {
      if (!pBody || !pFace) return;
      const { c, a } = mwRef.current;
      const ws = Math.max(0, 1 - c - a);
      const d = SHAPES[0].map((_, i) => {
        const x = SHAPES[0][i][0] * ws + SHAPES[1][i][0] * c + SHAPES[2][i][0] * a;
        const y = SHAPES[0][i][1] * ws + SHAPES[1][i][1] * c + SHAPES[2][i][1] * a;
        return x.toFixed(1) + " " + y.toFixed(1);
      });
      pBody.setAttribute("d", "M" + d.join("L") + "Z");
      pFace.setAttribute("transform", `translate(${(28 * c + 35 * a).toFixed(2)} ${(18 * a).toFixed(2)})`);
    }

    function applyState(s: SceneState) {
      const P = getParams(s, 0);
      svg!.dataset.s = s;
      shows.forEach(el => {
        const show = (el as SVGElement).dataset.show || "";
        el.classList.toggle("on", show.split(" ").includes(s));
      });
      bodies.forEach((g, i) => {
        const l = P.lean[i] || 0;
        g.style.setProperty("--sk", (-l).toFixed(2) + "deg");
        g.style.setProperty("--tx", (l * 0.9).toFixed(2) + "px");
      });
    }

    function tick() {
      if (isEnteringRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const s = stateRef.current;
      const tLen = typingLenRef.current;
      const P = getParams(s, tLen);
      const reduce = reduceRef.current;
      const k = reduce ? 1 : 0.16;
      const mw = mwRef.current;
      mw.c += (P.wc - mw.c) * k;
      mw.a += (P.wa - mw.a) * k;
      drawPurple();

      eyes.forEach(e => {
        let tx = 0, ty = 0;
        const L = P.look && P.look[e.key];
        if (L) {
          const len = Math.hypot(L[0], L[1]) || 1;
          const sc = Math.min(1, 1 / len);
          tx = L[0] * sc * e.max;
          ty = L[1] * sc * e.max;
        } else {
          const r = e.w.getBoundingClientRect();
          const dx = mouseRef.current.x - (r.left + r.width / 2);
          const dy = mouseRef.current.y - (r.top + r.height / 2);
          const a = Math.atan2(dy, dx);
          const m = Math.min(e.max, Math.hypot(dx, dy) / 22);
          tx = Math.cos(a) * m;
          ty = Math.sin(a) * m;
        }
        e.x += (tx - e.x) * (reduce ? 1 : 0.2);
        e.y += (ty - e.y) * (reduce ? 1 : 0.2);
        e.p.setAttribute("transform", `translate(${e.x.toFixed(2)} ${e.y.toFixed(2)})`);
      });

      if (yMouth && yBody) {
        let ymT: number;
        if (P.ym === null) {
          const r = yBody.getBoundingClientRect();
          ymT = Math.max(-1, Math.min(1, (mouseRef.current.x - (r.left + r.width / 2)) / (window.innerWidth / 4)));
        } else {
          ymT = P.ym as number;
        }
        ymCurRef.current += (ymT * 26 - ymCurRef.current) * (reduce ? 1 : 0.14);
        yMouth.setAttribute("transform", `translate(${ymCurRef.current.toFixed(2)} 0)`);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    // initial draw
    applyState(stateRef.current);
    drawPurple();
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  // React to external sceneState prop changes
  useEffect(() => {
    stateRef.current = sceneState;
    const svg = svgRef.current;
    if (!svg) return;

    const shows = [...svg.querySelectorAll("[data-show]")] as SVGElement[];
    const gP = svg.querySelector("#gP") as SVGGElement | null;
    const gB = svg.querySelector("#gB") as SVGGElement | null;
    const gY = svg.querySelector("#gY") as SVGGElement | null;
    const bodies = [gP, gB, gY].filter(Boolean) as SVGGElement[];

    svg.dataset.s = sceneState;
    shows.forEach(el => {
      const show = (el as SVGElement).dataset.show || "";
      el.classList.toggle("on", show.split(" ").includes(sceneState));
    });

    const P = getParams(sceneState, typingLen);
    bodies.forEach((g, i) => {
      const l = P.lean[i] || 0;
      g.style.setProperty("--sk", (-l).toFixed(2) + "deg");
      g.style.setProperty("--tx", (l * 0.9).toFixed(2) + "px");
    });

    // Shake purple on wrong
    if (sceneState === "wrong") {
      const shakeP = svg.querySelector("#shakeP") as SVGGElement | null;
      if (shakeP && !reduceRef.current) {
        shakeP.classList.remove("go");
        void shakeP.getBoundingClientRect();
        shakeP.classList.add("go");
      }
    }
  }, [sceneState, typingLen, getParams]);

  return (
    <svg
      ref={svgRef}
      id="scene"
      className={isEntering ? "hero-entering" : ""}
      viewBox="0 0 320 262"
      data-s="idle"
      aria-hidden="true"
      style={{ width: "min(78%, 540px)", height: "auto", overflow: "visible", display: "block" }}
    >
      <style>{`
        /* Base Scene Styles */
        .login-scene-b {
          transform-box: view-box;
          transform: translateX(var(--tx, 0px)) skewX(var(--sk, 0deg));
          transition: transform .4s cubic-bezier(.34, 1.45, .64, 1);
        }
        .login-scene-eye {
          transform-box: fill-box;
          transform-origin: center;
          transition: transform .3s cubic-bezier(.34, 1.45, .64, 1), opacity .25s ease-out;
        }
        [data-show] { opacity: 0; transition: opacity .25s ease-out; }
        [data-show].on { opacity: 1; }
        .login-stroke { fill: none; stroke: #1b1c1f; stroke-linecap: round; stroke-linejoin: round; }
        .login-pm { stroke-width: 3.2; }
        .login-shake.go { animation: login-shake-anim .6s ease-in-out; }
        @keyframes login-shake-anim {
          0%, 100% { transform: translateX(0); }
          12% { transform: translateX(-7px); }
          28% { transform: translateX(7px); }
          44% { transform: translateX(-6px); }
          60% { transform: translateX(5px); }
          76% { transform: translateX(-3px); }
          90% { transform: translateX(2px); }
        }
        #scene[data-s="typing"] #pEyes .login-scene-eye { transform: scaleY(.2); }
        #scene[data-s="pwd"] #bEyes .login-scene-eye,
        #scene[data-s="hide"] #bEyes .login-scene-eye { transform: scale(1.3); }
        #scene[data-s="show"] #bEyes .login-scene-eye { transform: scale(1.1); }

        /* ---- Superhero Acrobatic Drop Entrance Keyframes ---- */
        .hero-entering #gB {
          animation: heroEnterBlack 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-box: view-box;
          transform-origin: 194px 251px;
        }
        .hero-entering #bEyes {
          animation: heroEnterBlackEyes 1.5s ease-in-out forwards;
          transform-box: fill-box;
          transform-origin: center;
        }
        .hero-entering #shakeP {
          animation: heroEnterPurple 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-box: view-box;
          transform-origin: 135px 251px;
        }
        .hero-entering #pFace {
          animation: heroEnterPurpleFace 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .hero-entering #gO {
          animation: heroEnterOrange 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-box: view-box;
          transform-origin: 95px 251px;
        }
        .hero-entering #gY {
          animation: heroEnterYellow 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          transform-box: view-box;
          transform-origin: 251px 251px;
        }
        .hero-entering #yMouth {
          animation: heroEnterYellowMouth 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes heroEnterBlack {
          0% {
            transform: translate(30px, -320px) rotate(24deg) scale(0.9, 1.1);
            opacity: 0;
          }
          15% {
            transform: translate(18px, -190px) rotate(16deg);
            opacity: 1;
          }
          30% {
            transform: translate(6px, -95px) rotate(2deg);
          }
          42% {
            transform: translate(-30px, -35px) rotate(-68deg);
          }
          55% {
            transform: translate(-36px, 4px) rotate(-56deg);
          }
          68% {
            transform: translate(-14px, 0px) rotate(-18deg);
          }
          78% {
            transform: translate(-5px, 0px) rotate(-7deg);
          }
          88% {
            transform: translate(2px, 0px) rotate(2deg);
          }
          100% {
            transform: translate(0px, 0px) rotate(0deg);
          }
        }

        @keyframes heroEnterBlackEyes {
          0%, 72% {
            transform: scale(1);
          }
          78%, 86% {
            transform: scaleY(0.15);
          }
          92%, 100% {
            transform: scale(1);
          }
        }

        @keyframes heroEnterPurple {
          0% {
            transform: translate(-150px, 60px) rotate(-35deg) scale(0.85, 0.38);
            opacity: 0;
          }
          20% {
            transform: translate(-55px, -20px) rotate(45deg) scale(0.9, 0.42);
            opacity: 1;
          }
          35% {
            transform: translate(-20px, 0px) rotate(15deg) scale(0.95, 0.44);
          }
          48% {
            transform: translate(0px, 0px) rotate(0deg) scale(1.06, 0.38);
          }
          62% {
            transform: translate(0px, 0px) rotate(0deg) scale(1, 0.4);
          }
          78% {
            transform: translate(0px, 0px) rotate(0deg) scale(0.97, 0.72);
          }
          88% {
            transform: translate(0px, 0px) rotate(0deg) scale(1.02, 1.04);
          }
          100% {
            transform: translate(0px, 0px) rotate(0deg) scale(1, 1);
          }
        }

        @keyframes heroEnterPurpleFace {
          0%, 65% {
            opacity: 0;
            transform: translateY(110px);
          }
          78% {
            opacity: 0.85;
            transform: translateY(45px);
          }
          88% {
            opacity: 1;
            transform: translateY(-4px);
          }
          100% {
            opacity: 1;
            transform: translateY(0px);
          }
        }

        @keyframes heroEnterOrange {
          0% {
            transform: translate(-180px, -120px) rotate(-20deg) scale(0.45, 1.5);
            opacity: 0;
          }
          22% {
            transform: translate(-90px, -30px) rotate(12deg) scale(0.5, 1.4);
            opacity: 1;
          }
          38% {
            transform: translate(-40px, 10px) rotate(-6deg) scale(0.9, 0.7);
          }
          52% {
            transform: translate(-10px, 0px) rotate(2deg) scale(1.06, 0.92);
          }
          70% {
            transform: translate(0px, 0px) rotate(0deg) scale(1.02, 0.98);
          }
          88% {
            transform: translate(0px, 0px) rotate(0deg) scale(0.99, 1.01);
          }
          100% {
            transform: translate(0px, 0px) rotate(0deg) scale(1, 1);
          }
        }

        @keyframes heroEnterYellow {
          0% {
            transform: translateY(75px);
          }
          25% {
            transform: translateY(35px);
          }
          50% {
            transform: translateY(18px) scale(1.04, 0.95);
          }
          72% {
            transform: translateY(6px);
          }
          88% {
            transform: translateY(-2px);
          }
          100% {
            transform: translateY(0px) scale(1, 1);
          }
        }

        @keyframes heroEnterYellowMouth {
          0%, 45% {
            transform: rotate(-24deg);
            transform-origin: 232px 158px;
          }
          70% {
            transform: rotate(-12deg);
            transform-origin: 232px 158px;
          }
          88% {
            transform: rotate(2deg);
            transform-origin: 232px 158px;
          }
          100% {
            transform: rotate(0deg);
            transform-origin: 232px 158px;
          }
        }
      `}</style>
      {/* PURPLE */}
      <g className="login-shake" id="shakeP">
        <g className="login-scene-b" id="gP" style={{ transformOrigin: "135px 251px" } as React.CSSProperties}>
          <path id="pBody" fill="#6c22ff" d="" />
          <g id="pFace">
            <g id="pEyes">
              <g className="login-scene-eye" data-c="p" data-max="2.4">
                <circle className="w" cx={97} cy={21} r={5} fill="#fff" />
                <circle className="p" cx={97} cy={21} r={2.5} fill="#1b1c1f" />
              </g>
              <g className="login-scene-eye" data-c="p" data-max="2.4">
                <circle className="w" cx={131} cy={18} r={5} fill="#fff" />
                <circle className="p" cx={131} cy={18} r={2.5} fill="#1b1c1f" />
              </g>
            </g>
            <path data-show="idle forgot" className="login-stroke login-pm" d="M110 33 Q116 37 122 33" />
            <path data-show="email typing pwd hide" className="login-stroke login-pm" d="M115 28 L115 38" />
            <path data-show="wrong" className="login-stroke login-pm" d="M106 39 Q114 30 122 39" />
            <path data-show="show success" className="login-stroke login-pm" d="M108 31 Q116 39 124 31" />
          </g>
        </g>
      </g>

      {/* BLACK */}
      <g className="login-scene-b" id="gB" style={{ transformOrigin: "194px 251px" } as React.CSSProperties}>
        <rect x={159} y={75} width={70} height={176} fill="#1b1c1f" />
        <g id="bEyes">
          <g className="login-scene-eye" data-c="b" data-max="3.6">
            <circle className="w" cx={172} cy={85} r={6.5} fill="#fff" />
            <circle className="p" cx={172} cy={85} r={3.3} fill="#1b1c1f" />
          </g>
          <g className="login-scene-eye" data-c="b" data-max="3.6">
            <circle className="w" cx={191} cy={88} r={6.5} fill="#fff" />
            <circle className="p" cx={191} cy={88} r={3.3} fill="#1b1c1f" />
          </g>
        </g>
        <path data-show="wrong" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" d="M174 106 Q181 100 188 106" />
      </g>

      {/* YELLOW */}
      <g className="login-scene-b" id="gY" style={{ transformOrigin: "251px 251px" } as React.CSSProperties}>
        <path id="yBody" fill="#e8c80c" d="M211 251 V162 A40 40 0 0 1 291 162 V251 Z" />
        <g data-show="idle email typing pwd hide wrong forgot" className="login-scene-eye" data-c="y" data-max="3">
          <circle className="w" cx={249} cy={143} r={3} fill="none" />
          <circle className="p" cx={249} cy={143} r={3} fill="#1b1c1f" />
        </g>
        <path data-show="show success" className="login-stroke" strokeWidth={2.6} d="M244 143 L254 143" />
        <g id="yMouth">
          <path data-show="idle email typing pwd hide show forgot success" className="login-stroke" strokeWidth={4} strokeLinecap="butt" d="M213 158 L251 158" />
          <path data-show="wrong" className="login-stroke" strokeWidth={3} d="M226 160 q4 -5 8 0 t8 0 t8 0" />
        </g>
      </g>

      {/* ORANGE */}
      <g id="gO" style={{ transformOrigin: "95px 251px" } as React.CSSProperties}>
        <path fill="#ff8533" d="M2 251 A95 95 0 0 1 192 251 Z" />
        <g data-show="idle wrong forgot">
          <g className="login-scene-eye" data-c="o" data-max="3">
            <circle className="w" cx={48} cy={180} r={4} fill="none" />
            <circle className="p" cx={48} cy={180} r={4} fill="#1b1c1f" />
          </g>
          <g className="login-scene-eye" data-c="o" data-max="3">
            <circle className="w" cx={92} cy={185} r={4} fill="none" />
            <circle className="p" cx={92} cy={185} r={4} fill="#1b1c1f" />
          </g>
        </g>
        <g data-show="email typing pwd hide">
          <g className="login-scene-eye" data-c="o" data-max="3">
            <circle className="w" cx={45} cy={187} r={3} fill="none" />
            <circle className="p" cx={45} cy={187} r={3} fill="#1b1c1f" />
          </g>
          <g className="login-scene-eye" data-c="o" data-max="3">
            <circle className="w" cx={67} cy={194} r={3} fill="none" />
            <circle className="p" cx={67} cy={194} r={3} fill="#1b1c1f" />
          </g>
          <g className="login-scene-eye" data-c="o" data-max="3">
            <circle className="w" cx={89} cy={189} r={3} fill="none" />
            <circle className="p" cx={89} cy={189} r={3} fill="#1b1c1f" />
          </g>
        </g>
        <g data-show="show success" className="login-stroke" strokeWidth={2.6}>
          <path d="M38 192 Q44 184 50 192" />
          <path d="M60 198 Q66 190 72 198" />
          <path d="M82 193 Q88 185 94 193" />
        </g>
        <path data-show="idle forgot" className="login-stroke" strokeWidth={3} d="M61 191 Q70 201 79 191" />
        <path data-show="success" className="login-stroke" strokeWidth={3} d="M58 191 Q70 206 82 191" />
        <path data-show="wrong" className="login-stroke" strokeWidth={3} d="M61 200 Q70 191 79 200" />
      </g>
    </svg>
  );
}
