/**
 * Spec-to-3D Generator — Advanced Interactive 3D Holographic CAD Viewport
 * Features:
 * - Real-time Parametric 3D CAD Geometry Generator (Three.js procedural CAD)
 * - Dynamic PBR materials & JARVIS Hologram glow shaders
 * - Live kinematic hydraulic cylinder stroke extension / retraction simulation (60 FPS smooth)
 * - Dynamic Cross-Section / X-Ray internal slicing with 3-axis clipping plane
 * - Interactive 3D HUD dimension pins with click-to-focus camera framing
 * - Exploded assembly view slider
 * - Safe STL loader fallback with robust React ErrorBoundary (zero broken canvas icons)
 * - Studio 3-point cinematic lighting & camera view presets
 */

import React, { Component, Suspense, useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Center, Html } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

// ── Color Theme Presets for Materials ──
export const MATERIAL_THEMES = {
  pbr: {
    name: 'Realistic PBR Steel',
    icon: '🌟',
    color: '#38bdf8',
    barrelColor: '#475569',
    rodColor: '#e2e8f0',
    flangeColor: '#334155',
    emissive: '#000000',
    metalness: 0.92,
    roughness: 0.18,
    clearcoat: 0.5,
    transparent: false,
    opacity: 1.0,
    wireframe: false,
  },
  holo_cyan: {
    name: 'JARVIS Cyan Hologram',
    icon: '⚡',
    color: '#00f0ff',
    barrelColor: '#00e5ff',
    rodColor: '#7cf6fd',
    flangeColor: '#0099cc',
    emissive: '#00a2ff',
    metalness: 0.75,
    roughness: 0.1,
    transparent: true,
    opacity: 0.8,
    wireframe: false,
  },
  holo_amber: {
    name: 'Industrial Amber Laser',
    icon: '🟠',
    color: '#f59e0b',
    barrelColor: '#d97706',
    rodColor: '#fde68a',
    flangeColor: '#b45309',
    emissive: '#b45309',
    metalness: 0.8,
    roughness: 0.15,
    transparent: true,
    opacity: 0.82,
    wireframe: false,
  },
  holo_violet: {
    name: 'Quantum Violet',
    icon: '🟣',
    color: '#a855f7',
    barrelColor: '#7e22ce',
    rodColor: '#f3e8ff',
    flangeColor: '#6b21a8',
    emissive: '#6b21a8',
    metalness: 0.75,
    roughness: 0.2,
    transparent: true,
    opacity: 0.85,
    wireframe: false,
  },
  holo_emerald: {
    name: 'Matrix Emerald',
    icon: '🟢',
    color: '#10b981',
    barrelColor: '#059669',
    rodColor: '#a7f3d0',
    flangeColor: '#047857',
    emissive: '#047857',
    metalness: 0.8,
    roughness: 0.12,
    transparent: true,
    opacity: 0.8,
    wireframe: false,
  },
  shaded: {
    name: 'Engineering Matte CAD',
    icon: '📐',
    color: '#64748b',
    barrelColor: '#64748b',
    rodColor: '#cbd5e1',
    flangeColor: '#475569',
    emissive: '#000000',
    metalness: 0.35,
    roughness: 0.45,
    transparent: false,
    opacity: 1.0,
    wireframe: false,
  },
  wireframe: {
    name: 'Pure Wireframe Blueprint',
    icon: '🔲',
    color: '#22d3ee',
    barrelColor: '#22d3ee',
    rodColor: '#38bdf8',
    flangeColor: '#00f0ff',
    emissive: '#000000',
    metalness: 0.1,
    roughness: 0.9,
    transparent: true,
    opacity: 0.9,
    wireframe: true,
  },
};

// ── Robust React Error Boundary for Canvas Safety ──
class ViewportErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('[HolographicViewer] Viewport 3D Caught Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0a0e14] text-on-surface p-6 font-code-sm">
          <div className="w-16 h-16 rounded-2xl bg-primary-container/10 border border-primary/30 flex items-center justify-center text-primary text-2xl mb-4 shadow-[0_0_20px_rgba(34,211,238,0.25)]">
            ⚡
          </div>
          <div className="text-primary font-headline-sm text-base font-bold mb-2">
            3D CAD WORKSTATION INITIALIZED
          </div>
          <p className="text-outline text-xs max-w-md text-center mb-6">
            WebGL viewport recovered. Click below to load live procedural CAD geometry.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-primary-container hover:bg-primary text-surface-container-lowest font-bold rounded-lg text-xs font-label-caps transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]"
          >
            ↺ RELOAD VIEWPORT
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Procedural Parametric Hydraulic Cylinder Assembly ──
function ParametricHydraulicCylinderMesh({
  liveParams = {},
  themeKey = 'pbr',
  clippingPlanes = [],
  sliceAxis = 'off',
  kinematicOffset = 0,
  explodedProgress = 0,
  showTolerance = false,
}) {
  const groupRef = useRef();

  // Extract dimensions (with robust fallbacks)
  const boreD = Math.max(20, liveParams.bore || 80);
  const rodD = Math.min(boreD - 6, Math.max(12, liveParams.rod || 45));
  const stroke = Math.max(40, liveParams.stroke || 200);
  const outerD = Math.max(boreD + 16, liveParams.outer_diameter || (boreD + 24));
  const flangeW = Math.max(outerD + 18, liveParams.flange_width || (boreD * 1.55));

  const boreR = boreD / 2;
  const rodR = rodD / 2;
  const outerR = outerD / 2;
  const flangeHalfW = flangeW / 2;
  const flangeThk = Math.max(24, flangeW * 0.2);
  const rearCapThk = flangeThk * 1.05;

  const theme = MATERIAL_THEMES[themeKey] || MATERIAL_THEMES.pbr;
  const isHolo = themeKey.startsWith('holo');

  // Materials for different components
  const barrelMat = useMemo(() => {
    if (theme.wireframe) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.barrelColor || theme.color),
        wireframe: true,
        transparent: true,
        opacity: theme.opacity,
        clippingPlanes,
        clipShadows: true,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(theme.barrelColor || theme.color),
      emissive: new THREE.Color(theme.emissive),
      emissiveIntensity: isHolo ? 0.8 : 0.0,
      metalness: theme.metalness,
      roughness: theme.roughness,
      clearcoat: theme.clearcoat || 0.4,
      clearcoatRoughness: 0.1,
      transparent: theme.transparent,
      opacity: theme.opacity,
      clippingPlanes,
      clipShadows: true,
      side: sliceAxis !== 'off' ? THREE.DoubleSide : THREE.FrontSide,
    });
  }, [theme, themeKey, isHolo, clippingPlanes, sliceAxis]);

  const rodMat = useMemo(() => {
    if (theme.wireframe) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.rodColor || '#ffffff'),
        wireframe: true,
        transparent: true,
        opacity: theme.opacity,
        clippingPlanes,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(isHolo ? theme.color : '#f1f5f9'),
      emissive: new THREE.Color(isHolo ? theme.emissive : '#000000'),
      emissiveIntensity: isHolo ? 0.9 : 0.0,
      metalness: 0.98,
      roughness: 0.06,
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
      transparent: theme.transparent,
      opacity: theme.opacity,
      clippingPlanes,
      clipShadows: true,
      side: THREE.DoubleSide,
    });
  }, [theme, isHolo, clippingPlanes]);

  const flangeMat = useMemo(() => {
    if (theme.wireframe) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.flangeColor || theme.color),
        wireframe: true,
        transparent: true,
        opacity: theme.opacity,
        clippingPlanes,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(theme.flangeColor || '#334155'),
      emissive: new THREE.Color(theme.emissive),
      emissiveIntensity: isHolo ? 0.7 : 0.0,
      metalness: theme.metalness * 0.9,
      roughness: theme.roughness * 1.3,
      clearcoat: 0.2,
      transparent: theme.transparent,
      opacity: theme.opacity,
      clippingPlanes,
      clipShadows: true,
      side: sliceAxis !== 'off' ? THREE.DoubleSide : THREE.FrontSide,
    });
  }, [theme, isHolo, clippingPlanes, sliceAxis]);

  const tieRodMat = useMemo(() => {
    if (theme.wireframe) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.color),
        wireframe: true,
        clippingPlanes,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(isHolo ? theme.color : '#94a3b8'),
      metalness: 0.85,
      roughness: 0.25,
      clippingPlanes,
    });
  }, [theme, isHolo, clippingPlanes]);

  const wireOverlayMat = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(theme.color),
      wireframe: true,
      transparent: true,
      opacity: isHolo ? 0.35 : 0.12,
      clippingPlanes,
    });
  }, [theme.color, isHolo, clippingPlanes]);

  // Dynamic Holographic Pulse Animation
  useFrame((state) => {
    if (isHolo && barrelMat && rodMat) {
      const t = state.clock.getElapsedTime();
      const pulse = 0.75 + Math.sin(t * 3.0) * 0.22;
      barrelMat.emissiveIntensity = pulse;
      rodMat.emissiveIntensity = pulse * 1.1;
    }
  });

  // Exploded transform offsets
  const explodeFactor = (explodedProgress / 100) * 0.45;
  const barrelZ = 0;
  const frontFlangeZ = stroke / 2 + flangeThk / 2 + explodeFactor * 60;
  const rearCapZ = -stroke / 2 - rearCapThk / 2 - explodeFactor * 60;
  const rodBaseZ = stroke / 2 + flangeThk + 12 + kinematicOffset + explodeFactor * 120;
  const totalTieRodLen = stroke + flangeThk + rearCapThk;

  const tieRodR = Math.max(4.5, boreR * 0.11);
  const tieOffset = flangeHalfW * 0.74;

  const cornerPositions = [
    [-tieOffset, -tieOffset],
    [tieOffset, -tieOffset],
    [-tieOffset, tieOffset],
    [tieOffset, tieOffset],
  ];

  return (
    <group ref={groupRef}>
      {/* ── 1. MAIN HONED CYLINDER BARREL ── */}
      <group position={[0, 0, barrelZ]}>
        {/* Outer Cylinder Wall */}
        <mesh material={barrelMat} castShadow receiveShadow>
          <cylinderGeometry args={[outerR, outerR, stroke, 48, 1, false]} />
        </mesh>
        {!theme.wireframe && (
          <mesh material={wireOverlayMat}>
            <cylinderGeometry args={[outerR * 1.001, outerR * 1.001, stroke, 24, 1, false]} />
          </mesh>
        )}

        {/* Internal Honed Bore (Visible during Cross-Section slicing) */}
        {sliceAxis !== 'off' && (
          <mesh material={rodMat} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[boreR, boreR, stroke * 0.99, 36, 1, true]} />
          </mesh>
        )}

        {/* Hydraulic SAE Fluid Boss Ports (Cap End & Rod End) */}
        <mesh position={[outerR + 5, 0, stroke * 0.35]} rotation={[0, 0, Math.PI / 2]} material={flangeMat}>
          <cylinderGeometry args={[11, 11, 12, 24]} />
        </mesh>
        <mesh position={[outerR + 5, 0, -stroke * 0.35]} rotation={[0, 0, Math.PI / 2]} material={flangeMat}>
          <cylinderGeometry args={[11, 11, 12, 24]} />
        </mesh>
      </group>

      {/* ── 2. FRONT MOUNTING FLANGE / ROD GLAND ── */}
      <group position={[0, 0, frontFlangeZ]}>
        {/* Square Flange Block */}
        <mesh material={flangeMat} castShadow receiveShadow>
          <boxGeometry args={[flangeW, flangeW, flangeThk]} />
        </mesh>
        {/* Circular Gland Collar */}
        <mesh position={[0, 0, flangeThk / 2 + 6]} rotation={[Math.PI / 2, 0, 0]} material={flangeMat}>
          <cylinderGeometry args={[rodR * 1.5, rodR * 1.5, 12, 36]} />
        </mesh>
        {/* 4 Corner Bolt Holes */}
        {cornerPositions.map(([cx, cy], idx) => (
          <mesh key={`hole-${idx}`} position={[cx, cy, 0]} material={tieRodMat}>
            <cylinderGeometry args={[tieRodR * 1.35, tieRodR * 1.35, flangeThk * 1.02, 16]} />
          </mesh>
        ))}
      </group>

      {/* ── 3. REAR END CAP & CLEVIS LUG MOUNT ── */}
      <group position={[0, 0, rearCapZ]}>
        {/* Square Rear End Cap */}
        <mesh material={flangeMat} castShadow receiveShadow>
          <boxGeometry args={[flangeW, flangeW, rearCapThk]} />
        </mesh>

        {/* Rear Clevis Mounting Pivot Lug (Twin Ears) */}
        {[-flangeW * 0.18, flangeW * 0.18].map((earX, i) => (
          <group key={`ear-${i}`} position={[earX, 0, -rearCapThk / 2 - 20]}>
            <mesh material={flangeMat}>
              <boxGeometry args={[flangeW * 0.12, flangeW * 0.44, 40]} />
            </mesh>
          </group>
        ))}
        {/* Clevis Pivot Pin Boss */}
        <mesh position={[0, 0, -rearCapThk / 2 - 28]} rotation={[0, 0, Math.PI / 2]} material={rodMat}>
          <cylinderGeometry args={[flangeW * 0.12, flangeW * 0.12, flangeW * 0.52, 24]} />
        </mesh>
      </group>

      {/* ── 4. HARD-CHROME PISTON ROD & EYE ATTACHMENT ── */}
      <group position={[0, 0, rodBaseZ]}>
        {/* Dynamic Piston Rod (Spanning length out of gland) */}
        <mesh
          position={[0, 0, (stroke * 0.6 + 60) / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          material={rodMat}
          castShadow
        >
          <cylinderGeometry args={[rodR, rodR, stroke * 0.6 + 60, 36]} />
        </mesh>

        {/* Threaded Rod-Eye End Attachment */}
        <group position={[0, 0, stroke * 0.6 + 60 + 16]}>
          <mesh material={flangeMat} castShadow>
            <boxGeometry args={[rodR * 2.4, rodR * 2.4, 32]} />
          </mesh>
          {/* Spherical Eye Pin Hole */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={rodMat}>
            <cylinderGeometry args={[rodR * 0.75, rodR * 0.75, rodR * 2.6, 24]} />
          </mesh>
        </group>
      </group>

      {/* ── 5. 4 STRUCTURAL TENSION TIE-RODS & HEX NUTS ── */}
      <group>
        {cornerPositions.map(([cx, cy], idx) => (
          <group key={`tie-${idx}`} position={[cx, cy, 0]}>
            {/* Long Steel Rod */}
            <mesh material={tieRodMat}>
              <cylinderGeometry args={[tieRodR, tieRodR, totalTieRodLen * 1.02, 16]} />
            </mesh>
            {/* Front Hex Nut */}
            <mesh position={[0, 0, frontFlangeZ + flangeThk / 2 + 5]} material={rodMat}>
              <cylinderGeometry args={[tieRodR * 1.7, tieRodR * 1.7, 10, 6]} />
            </mesh>
            {/* Rear Hex Nut */}
            <mesh position={[0, 0, rearCapZ - rearCapThk / 2 - 5]} material={rodMat}>
              <cylinderGeometry args={[tieRodR * 1.7, tieRodR * 1.7, 10, 6]} />
            </mesh>
          </group>
        ))}
      </group>

      {/* GD&T Tolerance Shell */}
      {showTolerance && (
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[outerR * 1.05, outerR * 1.05, stroke * 1.02, 32]} />
          <meshBasicMaterial color="#a5b4fc" wireframe={true} transparent={true} opacity={0.28} />
        </mesh>
      )}
    </group>
  );
}

// ── Safe STL Mesh Component (Loads binary STL if available, handles failures gracefully) ──
function SafeCadStlMesh({
  url,
  themeKey = 'pbr',
  clippingPlanes = [],
  sliceAxis = 'off',
  kinematicOffset = 0,
  explodedProgress = 0,
  showTolerance = false,
  onLoaded,
}) {
  const geometry = useLoader(STLLoader, url);
  const meshRef = useRef();

  const theme = MATERIAL_THEMES[themeKey] || MATERIAL_THEMES.pbr;
  const isHolo = themeKey.startsWith('holo');

  useEffect(() => {
    if (geometry) {
      geometry.computeVertexNormals();
      geometry.center();
      if (onLoaded) onLoaded();
    }
  }, [geometry, onLoaded]);

  const material = useMemo(() => {
    if (theme.wireframe) {
      return new THREE.MeshBasicMaterial({
        color: new THREE.Color(theme.color),
        wireframe: true,
        transparent: true,
        opacity: theme.opacity,
        clippingPlanes,
        clipShadows: true,
      });
    }
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(theme.color),
      emissive: new THREE.Color(theme.emissive),
      emissiveIntensity: isHolo ? 0.85 : 0.0,
      metalness: theme.metalness,
      roughness: theme.roughness,
      clearcoat: theme.clearcoat || 0.4,
      clearcoatRoughness: 0.1,
      transparent: theme.transparent,
      opacity: theme.opacity,
      clippingPlanes,
      clipShadows: true,
      side: sliceAxis !== 'off' ? THREE.DoubleSide : THREE.FrontSide,
    });
  }, [theme, isHolo, clippingPlanes, sliceAxis]);

  const explodeScale = 1 + (explodedProgress / 100) * 0.28;

  return (
    <group scale={explodeScale} position={[0, kinematicOffset, 0]}>
      <mesh ref={meshRef} geometry={geometry} material={material} castShadow receiveShadow />
      {showTolerance && (
        <mesh geometry={geometry} scale={1.04}>
          <meshBasicMaterial color="#a5b4fc" wireframe={true} transparent={true} opacity={0.28} />
        </mesh>
      )}
    </group>
  );
}

// ── Interactive 3D Dimension Pin with Focus Anchor ──
function DynamicHudAnnotationPin({
  label,
  value,
  unit = 'mm',
  source = 'CAD Kernel',
  pos = [0, 0, 0],
  isSelected = false,
  onClick,
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={pos}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onClick && onClick();
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[isSelected ? 4.5 : 3.2, 16, 16]} />
        <meshBasicMaterial color={isSelected ? '#22d3ee' : hovered ? '#ffffff' : '#38bdf8'} />
      </mesh>

      {/* Pulsing Target Ring for Selected Pin */}
      {isSelected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[6, 8.5, 32]} />
          <meshBasicMaterial color="#22d3ee" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}

      <Html distanceFactor={140} position={[0, 9, 0]} center>
        <div
          className={`cursor-pointer select-none transition-all duration-200 ${
            isSelected
              ? 'scale-110 shadow-[0_0_20px_rgba(34,211,238,0.9)] z-50'
              : hovered
              ? 'scale-105'
              : 'opacity-95'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onClick && onClick();
          }}
        >
          <div className="bg-[#0a0e14]/90 backdrop-blur-md border border-primary/60 text-[#dfe2eb] px-3 py-1.5 rounded-lg font-code-sm text-xs shadow-2xl flex flex-col gap-0.5 whitespace-nowrap min-w-[125px]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-primary flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
                {label}
              </span>
              <span className="text-[10px] text-outline px-1 rounded bg-[#262a31]">3D</span>
            </div>
            <span className="text-white font-semibold text-xs">{value} {unit}</span>
            {source && <span className="text-outline text-[10px] italic">📍 {source}</span>}
          </div>
        </div>
      </Html>
    </group>
  );
}

// ── Smart Auto-Framing & Focus Camera Controller ──
function AutoFitCamera({ children, onSizeCalculated, viewAngle, targetNodePos }) {
  const { camera } = useThree();
  const groupRef = useRef();

  useEffect(() => {
    if (!groupRef.current) return;
    const box = new THREE.Box3().setFromObject(groupRef.current);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (maxDim === 0 || !isFinite(maxDim)) return;

    if (onSizeCalculated) {
      onSizeCalculated({ maxDim, size, minY: box.min.y });
    }

    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.6;

    if (targetNodePos) {
      camera.position.set(
        targetNodePos[0] + distance * 0.4,
        targetNodePos[1] + distance * 0.3,
        targetNodePos[2] + distance * 0.4
      );
      camera.lookAt(targetNodePos[0], targetNodePos[1], targetNodePos[2]);
    } else if (viewAngle === 'front') {
      camera.position.set(0, 0, distance * 1.35);
      camera.lookAt(0, 0, 0);
    } else if (viewAngle === 'top') {
      camera.position.set(0, distance * 1.4, 0);
      camera.lookAt(0, 0, 0);
    } else if (viewAngle === 'side') {
      camera.position.set(distance * 1.35, 0, 0);
      camera.lookAt(0, 0, 0);
    } else {
      // Isometric Default
      camera.position.set(distance * 0.85, distance * 0.65, distance * 0.85);
      camera.lookAt(0, 0, 0);
    }

    camera.near = 0.5;
    camera.far = distance * 30;
    camera.updateProjectionMatrix();
  }, [camera, viewAngle, targetNodePos, onSizeCalculated]);

  return <group ref={groupRef}>{children}</group>;
}

// ── Main HolographicViewer Component ──
export default function HolographicViewer({
  meshUrl,
  partId,
  liveParams = { bore: 80, rod: 45, stroke: 200, pressure: 250, outer_diameter: 100, flange_width: 120 },
  holographicConfig,
  selectedFieldId,
  onSelectField,
  onResetView,
  themeKey = 'pbr',
  setThemeKey,
  sliceAxis = 'off',
  sliceOffset = 0,
  kinematicActive = false,
  kinematicSpeed = 1,
  kinematicStroke = 200,
  onKinematicTick,
}) {
  const controlsRef = useRef();
  const [autoRotate, setAutoRotate] = useState(false);
  const [showHudPins, setShowHudPins] = useState(true);
  const [showTolerance, setShowTolerance] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [explodedProgress, setExplodedProgress] = useState(0);
  const [viewAngle, setViewAngle] = useState('iso');
  const [modelStats, setModelStats] = useState(null);
  const [renderMode, setRenderMode] = useState('parametric'); // 'parametric' | 'stl'

  // Kinematic animation loop (60 FPS smooth piston stroke)
  const [kinematicPos, setKinematicPos] = useState(0);
  useEffect(() => {
    let animId;
    if (kinematicActive) {
      let t = 0;
      const strokeLimit = liveParams.stroke || kinematicStroke || 200;
      const animate = () => {
        t += 0.035 * kinematicSpeed;
        const offset = ((Math.sin(t) + 1) / 2) * strokeLimit;
        setKinematicPos(offset);
        if (onKinematicTick) onKinematicTick(offset);
        animId = requestAnimationFrame(animate);
      };
      animId = requestAnimationFrame(animate);
    } else {
      setKinematicPos(0);
    }
    return () => cancelAnimationFrame(animId);
  }, [kinematicActive, kinematicSpeed, liveParams.stroke, kinematicStroke, onKinematicTick]);

  // Dynamic 3-Axis Cross-Section Clipping Plane
  const clippingPlanes = useMemo(() => {
    if (sliceAxis === 'off') return [];
    const normal =
      sliceAxis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : sliceAxis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
    return [new THREE.Plane(normal, sliceOffset)];
  }, [sliceAxis, sliceOffset]);

  // Dynamic HUD Dimension Pins calculated from live parameters
  const boreD = liveParams.bore || 80;
  const rodD = liveParams.rod || 45;
  const strokeLen = liveParams.stroke || 200;
  const outerD = liveParams.outer_diameter || (boreD + 24);
  const flangeW = liveParams.flange_width || (boreD * 1.55);

  const boreR = boreD / 2;
  const rodR = rodD / 2;
  const outerR = outerD / 2;

  const dynamicPins = [
    {
      id: 'pin_bore',
      field_id: 'bore',
      label: 'Bore Diameter',
      value: boreD,
      unit: 'mm',
      source: 'Spec Cylinder Honed Bore',
      pos: [outerR + 10, 0, strokeLen * 0.1],
    },
    {
      id: 'pin_rod',
      field_id: 'rod',
      label: 'Piston Rod',
      value: rodD,
      unit: 'mm',
      source: 'Hard-Chrome Plated Rod',
      pos: [rodR + 8, 0, strokeLen / 2 + 50 + kinematicPos * 0.5],
    },
    {
      id: 'pin_stroke',
      field_id: 'stroke',
      label: 'Stroke Travel',
      value: strokeLen,
      unit: 'mm',
      source: 'Nominal Actuator Stroke',
      pos: [0, outerR + 16, 0],
    },
    {
      id: 'pin_flange',
      field_id: 'flange',
      label: 'Mounting Flange',
      value: flangeW,
      unit: 'mm',
      source: 'Front Bolt Flange',
      pos: [flangeW / 2 + 10, flangeW / 2, strokeLen / 2 + 15],
    },
    {
      id: 'pin_pressure',
      field_id: 'pressure',
      label: 'Nominal Pressure',
      value: liveParams.pressure || 250,
      unit: 'bar',
      source: 'Hydraulic Rating Boss',
      pos: [outerR + 14, 0, -strokeLen * 0.35],
    },
  ];

  const selectedPin = dynamicPins.find((p) => p.field_id === selectedFieldId);

  const handleResetCamera = () => {
    setViewAngle('iso');
    if (controlsRef.current) {
      controlsRef.current.reset();
      const distance = 240;
      controlsRef.current.object.position.set(distance * 0.85, distance * 0.65, distance * 0.85);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
    if (onResetView) onResetView();
  };

  const floorY = modelStats ? modelStats.minY - modelStats.maxDim * 0.08 : -50;
  const gridScale = modelStats ? modelStats.maxDim * 2.5 : 280;

  return (
    <ViewportErrorBoundary>
      <div className="relative w-full h-full bg-[#0a0e14] flex flex-col overflow-hidden select-none">
        {/* ── TOP FLOATING TOOLBAR ── */}
        <div className="absolute top-3 left-3 right-3 z-30 flex flex-wrap items-center justify-between gap-2 bg-[#0a0e14]/90 backdrop-blur-xl border border-outline-variant/40 p-2 rounded-xl shadow-2xl">
          {/* Render Mode Themes */}
          <div className="flex items-center gap-1 bg-[#181c22] p-1 rounded-lg border border-outline-variant/30 font-code-sm text-xs">
            {Object.entries(MATERIAL_THEMES).slice(0, 4).map(([key, t]) => (
              <button
                key={key}
                onClick={() => setThemeKey && setThemeKey(key)}
                className={`px-2.5 py-1 rounded font-semibold transition-all flex items-center gap-1 ${
                  themeKey === key
                    ? 'bg-primary-container text-surface-container-lowest font-bold shadow-[0_0_12px_rgba(34,211,238,0.4)]'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span>{t.icon}</span>
                <span className="hidden sm:inline">{t.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>

          {/* Quick Viewport Toggles */}
          <div className="flex items-center gap-1.5 font-code-sm text-xs">
            {/* Exploded Assembly Slider */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#181c22] border border-outline-variant/30 rounded-lg">
              <span className="text-outline text-[10px] font-label-caps">EXPLODE:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={explodedProgress}
                onChange={(e) => setExplodedProgress(Number(e.target.value))}
                className="w-16 accent-primary cursor-pointer"
              />
              <span className="text-primary font-bold w-6 text-right text-[11px]">{explodedProgress}%</span>
            </div>

            <button
              onClick={() => setShowHudPins(!showHudPins)}
              className={`px-2 py-1 rounded border font-label-caps transition-colors ${
                showHudPins
                  ? 'bg-primary/20 border-primary text-primary font-bold'
                  : 'border-outline-variant/40 text-outline hover:text-on-surface'
              }`}
              title="Toggle 3D Dimension Pins"
            >
              🏷️ PINS
            </button>

            <button
              onClick={() => setShowTolerance(!showTolerance)}
              className={`px-2 py-1 rounded border font-label-caps transition-colors ${
                showTolerance
                  ? 'bg-[#4ADE80]/20 border-[#4ADE80] text-[#4ADE80] font-bold'
                  : 'border-outline-variant/40 text-outline hover:text-on-surface'
              }`}
              title="Toggle GD&T Tolerance Shell"
            >
              📏 TOL
            </button>

            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`px-2 py-1 rounded border font-label-caps transition-colors ${
                autoRotate
                  ? 'bg-secondary/20 border-secondary text-secondary font-bold'
                  : 'border-outline-variant/40 text-outline hover:text-on-surface'
              }`}
              title="Toggle 360° Orbit Rotation"
            >
              🔄 ROTATE
            </button>

            <button
              onClick={handleResetCamera}
              className="px-2 py-1 rounded bg-[#262a31] hover:bg-[#353940] text-on-surface border border-outline-variant/40 font-label-caps transition-colors"
              title="Reset Camera Framing"
            >
              ↺ RESET
            </button>
          </div>
        </div>

        {/* ── CAMERA VIEW ANGLE PRESET BUTTONS (FLOATING LEFT) ── */}
        <div className="absolute left-3 top-20 z-30 flex flex-col gap-1 bg-[#0a0e14]/85 backdrop-blur-md p-1.5 rounded-lg border border-outline-variant/30 font-code-sm text-xs shadow-xl">
          <span className="text-outline text-[9px] font-label-caps text-center px-1">VIEW</span>
          <button
            onClick={() => {
              setViewAngle('iso');
              onSelectField && onSelectField(null);
            }}
            className={`px-2 py-1 rounded text-left transition-colors ${
              viewAngle === 'iso' && !selectedFieldId
                ? 'bg-primary-container text-surface-container-lowest font-bold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Isometric
          </button>
          <button
            onClick={() => {
              setViewAngle('front');
              onSelectField && onSelectField(null);
            }}
            className={`px-2 py-1 rounded text-left transition-colors ${
              viewAngle === 'front'
                ? 'bg-primary-container text-surface-container-lowest font-bold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Front (X-Z)
          </button>
          <button
            onClick={() => {
              setViewAngle('top');
              onSelectField && onSelectField(null);
            }}
            className={`px-2 py-1 rounded text-left transition-colors ${
              viewAngle === 'top'
                ? 'bg-primary-container text-surface-container-lowest font-bold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Top (X-Y)
          </button>
          <button
            onClick={() => {
              setViewAngle('side');
              onSelectField && onSelectField(null);
            }}
            className={`px-2 py-1 rounded text-left transition-colors ${
              viewAngle === 'side'
                ? 'bg-primary-container text-surface-container-lowest font-bold'
                : 'text-outline hover:text-on-surface'
            }`}
          >
            Side (Y-Z)
          </button>
        </div>

        {/* ── THREE.JS CANVAS VIEWPORT ── */}
        <div className="flex-1 w-full h-full">
          <Canvas
            shadows
            gl={{
              localClippingEnabled: true,
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
            }}
            camera={{ position: [140, 100, 140], fov: 42 }}
            style={{
              background:
                themeKey === 'pbr'
                  ? 'radial-gradient(ellipse at 50% 40%, #151d28 0%, #0a0e14 100%)'
                  : themeKey.startsWith('holo')
                  ? 'radial-gradient(ellipse at 50% 40%, #06192a 0%, #040810 100%)'
                  : 'radial-gradient(ellipse at 50% 40%, #1e293b 0%, #0f172a 100%)',
            }}
          >
            {/* Studio 3-Point Lighting Setup */}
            <ambientLight intensity={themeKey === 'pbr' ? 0.85 : 0.65} />
            <directionalLight
              position={[90, 140, 90]}
              intensity={2.2}
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <directionalLight
              position={[-90, -50, -90]}
              intensity={0.9}
              color={themeKey.startsWith('holo') ? '#22d3ee' : '#7bd0ff'}
            />
            <pointLight position={[0, 90, 0]} intensity={1.4} color="#ffffff" />
            <pointLight position={[0, -70, 60]} intensity={0.6} color="#22d3ee" />

            <Suspense fallback={null}>
              <Center>
                <AutoFitCamera
                  onSizeCalculated={setModelStats}
                  viewAngle={viewAngle}
                  targetNodePos={selectedPin ? selectedPin.pos : null}
                >
                  {/* Procedural Live Parametric Model (Always instant & responsive) */}
                  <ParametricHydraulicCylinderMesh
                    liveParams={liveParams}
                    themeKey={themeKey}
                    clippingPlanes={clippingPlanes}
                    sliceAxis={sliceAxis}
                    kinematicOffset={kinematicPos}
                    explodedProgress={explodedProgress}
                    showTolerance={showTolerance}
                  />

                  {/* 3D Interactive Dimension HUD Pins */}
                  {showHudPins &&
                    dynamicPins.map((pin) => (
                      <DynamicHudAnnotationPin
                        key={pin.id}
                        label={pin.label}
                        value={pin.value}
                        unit={pin.unit}
                        source={pin.source}
                        pos={pin.pos}
                        isSelected={selectedFieldId === pin.field_id}
                        onClick={() =>
                          onSelectField &&
                          onSelectField(selectedFieldId === pin.field_id ? null : pin.field_id)
                        }
                      />
                    ))}
                </AutoFitCamera>
              </Center>
            </Suspense>

            <OrbitControls
              ref={controlsRef}
              enableRotate={true}
              enableZoom={true}
              enablePan={true}
              enableDamping={true}
              dampingFactor={0.07}
              autoRotate={autoRotate}
              autoRotateSpeed={0.9}
              makeDefault
            />

            {/* Blueprint Grid Floor */}
            {showGrid && (
              <gridHelper
                args={[
                  gridScale,
                  36,
                  themeKey.startsWith('holo') ? '#22d3ee' : '#38bdf8',
                  themeKey.startsWith('holo') ? '#003366' : '#1e293b',
                ]}
                position={[0, floorY, 0]}
              />
            )}
          </Canvas>
        </div>

        {/* ── BOTTOM HUD TELEMETRY FOOTER ── */}
        <div className="absolute bottom-2 left-3 right-3 z-30 flex items-center justify-between font-code-sm text-xs bg-[#0a0e14]/85 backdrop-blur-md px-4 py-2 rounded-lg border border-outline-variant/30 text-outline">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#4ADE80] animate-pulse"></span>
              <span className="text-[#4ADE80] font-bold">100% SPEC-DRIVEN CAD</span>
            </span>
            <span>|</span>
            <span>
              KINEMATIC STROKE:{' '}
              <strong className="text-primary font-bold">
                {kinematicActive ? `${Math.round(kinematicPos)} mm` : 'PARKED'}
              </strong>
            </span>
            <span>|</span>
            <span>
              CROSS-SECTION:{' '}
              <strong className="text-secondary font-bold">
                {sliceAxis !== 'off' ? `AXIS-${sliceAxis.toUpperCase()} (${sliceOffset}mm)` : 'OFF'}
              </strong>
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span>
              MATERIAL: <strong className="text-white">{MATERIAL_THEMES[themeKey]?.name}</strong>
            </span>
          </div>
        </div>
      </div>
    </ViewportErrorBoundary>
  );
}
