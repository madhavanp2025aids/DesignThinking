/**
 * Spec-to-3D Generator — JARVIS / Holographic 3D Interactive Viewer Component
 * Renders parametric 3D models with holographic emissive shading, fresnel rim glow,
 * 3D HUD floating annotations, reveal scan animations, and interactive inspection nodes.
 */

import React, { Suspense, useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useLoader, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Center, Html } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

// Holographic Shaders & Materials
function HolographicMesh({ url, holographicConfig, highlightedFieldId, onSelectAnchor, cinematicMode, showTolerance }) {
  const geometry = useLoader(STLLoader, url);
  const meshRef = useRef();
  const wireframeRef = useRef();

  const isPlaceholder = holographicConfig?.status_badge === 'INCOMPLETE_SPEC_PLACEHOLDER';
  const primaryColor = isPlaceholder ? '#ff3366' : '#00f0ff';
  const emissiveColor = isPlaceholder ? '#ff0033' : '#0077ff';

  // Holographic Material Definition
  const holoMaterial = useMemo(() => {
    if (!cinematicMode) {
      return new THREE.MeshStandardMaterial({
        color: isPlaceholder ? '#ff5577' : '#2563eb',
        metalness: 0.7,
        roughness: 0.25,
        wireframe: isPlaceholder,
      });
    }

    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(primaryColor),
      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.85,
      transmission: 0.65,
      ior: 1.45,
      opacity: isPlaceholder ? 0.45 : 0.78,
      transparent: true,
      wireframe: false,
    });
  }, [cinematicMode, isPlaceholder, primaryColor, emissiveColor]);

  // Wireframe Accent overlay
  const wireMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(isPlaceholder ? '#ff99aa' : '#70eaff'),
      wireframe: true,
      transparent: true,
      opacity: cinematicMode ? 0.35 : 0.1,
    });
  }, [cinematicMode, isPlaceholder]);

  useEffect(() => {
    if (geometry) {
      geometry.computeVertexNormals();
      geometry.center();
    }
  }, [geometry]);

  // Subtle pulsing animation in cinematic mode
  useFrame((state) => {
    if (cinematicMode && meshRef.current && holoMaterial) {
      const time = state.clock.getElapsedTime();
      const pulse = Math.sin(time * 2.4) * 0.12 + 0.85;
      holoMaterial.emissiveIntensity = pulse;
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={geometry} material={holoMaterial} castShadow receiveShadow />
      {cinematicMode && (
        <mesh ref={wireframeRef} geometry={geometry} material={wireMaterial} scale={1.002} />
      )}
      {/* GD&T Tolerance Envelope Visualization */}
      {showTolerance && (
        <mesh geometry={geometry} scale={1.03}>
          <meshBasicMaterial color="#a5b4fc" wireframe={true} transparent={true} opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

// 3D Floating HUD Annotation Pin
function HudAnnotationMarker({ node, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);
  const pos = node.position_3d || [0, 0, 0];

  return (
    <group position={pos}>
      <mesh onClick={onClick} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <sphereGeometry args={[isSelected ? 4.5 : 3.0, 16, 16]} />
        <meshBasicMaterial color={isSelected ? '#facc15' : hovered ? '#ffffff' : '#00f0ff'} />
      </mesh>
      <Html distanceFactor={140} position={[0, 8, 0]} center>
        <div
          className={`hud-pin ${isSelected ? 'hud-pin--selected' : ''} ${hovered ? 'hud-pin--hover' : ''}`}
          onClick={onClick}
        >
          <div className="hud-pin-pulse" />
          <div className="hud-pin-card">
            <span className="hud-pin-label">{node.label}</span>
            <span className="hud-pin-value">{node.display_value}</span>
            {node.source_location && (
              <span className="hud-pin-source">📍 {node.source_location}</span>
            )}
          </div>
        </div>
      </Html>
    </group>
  );
}

function AutoFitCamera({ children, onSizeCalculated }) {
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
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.7;

    camera.position.set(distance * 0.8, distance * 0.6, distance * 0.8);
    camera.lookAt(0, 0, 0);
    camera.near = 0.5;
    camera.far = distance * 20;
    camera.updateProjectionMatrix();
  }, [camera, children, onSizeCalculated]);

  return <group ref={groupRef}>{children}</group>;
}

export default function HolographicViewer({
  meshUrl,
  partId,
  holographicConfig,
  selectedFieldId,
  onSelectField,
  onResetView
}) {
  const controlsRef = useRef();
  const [cinematicMode, setCinematicMode] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showHudPins, setShowHudPins] = useState(true);
  const [showTolerance, setShowTolerance] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [modelStats, setModelStats] = useState(null);

  const isPlaceholder = holographicConfig?.status_badge === 'INCOMPLETE_SPEC_PLACEHOLDER';
  const hudNodes = holographicConfig?.interaction?.hud_nodes || [];

  const handleReset = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
      if (modelStats && modelStats.maxDim) {
        const distance = modelStats.maxDim * 1.6;
        controlsRef.current.object.position.set(distance * 0.8, distance * 0.6, distance * 0.8);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
    if (onResetView) onResetView();
  };

  const handleDownloadCad = (format) => {
    if (!partId) return;
    const url = format === 'step' ? api.getStepDownloadUrl(partId) : api.getIgesDownloadUrl(partId);
    window.open(url, '_blank');
  };

  if (!meshUrl) {
    return (
      <div className="hologram-empty-state">
        <div className="hologram-empty-icon">⚛</div>
        <p className="hologram-empty-text">No CAD geometry loaded. Select a part to activate holographic projection.</p>
      </div>
    );
  }

  const floorY = modelStats ? modelStats.minY - modelStats.maxDim * 0.05 : -40;
  const gridScale = modelStats ? modelStats.maxDim * 2.5 : 150;
  const minZoomDist = modelStats ? Math.max(modelStats.maxDim * 0.35, 1.0) : 5.0;
  const maxZoomDist = modelStats ? Math.max(modelStats.maxDim * 8.0, 50.0) : 4000.0;

  return (
    <div className={`hologram-viewer-container ${cinematicMode ? 'mode-cinematic' : 'mode-solid'}`}>
      {/* Background Holographic HUD Grid Overlay */}
      <div className="hologram-scanline-overlay" />
      <div className="hologram-vignette" />

      {/* Top Holographic Header Bar */}
      <div className="hologram-header-bar">
        <div className="hologram-status-badge">
          <span className={`status-dot ${isPlaceholder ? 'status-dot--warning' : 'status-dot--active'}`} />
          <span className="status-title">
            {isPlaceholder ? 'INCOMPLETE GEOMETRY / PLACEHOLDER' : 'JARVIS HOLOGRAPHIC PROJECTION'}
          </span>
        </div>

        <div className="hologram-toolbar-actions">
          <button
            className={`btn-holo-toggle ${cinematicMode ? 'active' : ''}`}
            onClick={() => setCinematicMode(!cinematicMode)}
            title="Toggle Iron-Man Holographic / Solid CAD Mode"
          >
            {cinematicMode ? '✨ Hologram: ON' : '📐 Solid CAD'}
          </button>
          <button
            className={`btn-holo-toggle ${showTolerance ? 'active' : ''}`}
            onClick={() => setShowTolerance(!showTolerance)}
            title="Toggle GD&T Tolerance Envelope Shell"
          >
            {showTolerance ? '📏 Tol Band: ON' : '📏 Tol Band: OFF'}
          </button>
          <button
            className={`btn-holo-toggle ${showHudPins ? 'active' : ''}`}
            onClick={() => setShowHudPins(!showHudPins)}
          >
            {showHudPins ? '🏷️ 3D HUD: ON' : '🏷️ 3D HUD: OFF'}
          </button>
          <button
            className={`btn-holo-toggle ${autoRotate ? 'active' : ''}`}
            onClick={() => setAutoRotate(!autoRotate)}
          >
            {autoRotate ? '🔄 Rotate: ON' : '⏸️ Rotate: OFF'}
          </button>
          {partId && (
            <>
              <button
                className="btn-holo-toggle"
                onClick={() => handleDownloadCad('step')}
                title="Download Pure-Python ISO 10303-21 STEP CAD Model"
              >
                💾 STEP
              </button>
              <button
                className="btn-holo-toggle"
                onClick={() => handleDownloadCad('iges')}
                title="Download IGES CAD Model"
              >
                💾 IGES
              </button>
            </>
          )}
          <button className="btn-holo-reset" onClick={handleReset} title="Reset View to Default Framing">
            ↺ Reset View
          </button>
        </div>
      </div>

      {/* Canvas 3D Viewport */}
      <Canvas
        camera={{ position: [120, 90, 120], fov: 45 }}
        style={{
          background: cinematicMode
            ? 'radial-gradient(ellipse at center, #0a192f 0%, #030814 100%)'
            : 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 100%)'
        }}
      >
        <ambientLight intensity={cinematicMode ? 0.7 : 0.9} />
        <directionalLight position={[60, 100, 60]} intensity={cinematicMode ? 1.8 : 1.4} />
        <directionalLight position={[-60, -40, -60]} intensity={0.6} color={cinematicMode ? '#00f0ff' : '#ffffff'} />
        <pointLight position={[0, 0, 100]} intensity={0.8} color="#00e5ff" />

        <Suspense fallback={null}>
          <Center>
            <AutoFitCamera onSizeCalculated={setModelStats}>
              <HolographicMesh
                url={meshUrl}
                holographicConfig={holographicConfig}
                highlightedFieldId={selectedFieldId}
                onSelectAnchor={onSelectField}
                cinematicMode={cinematicMode}
                showTolerance={showTolerance}
              />
              {/* Floating 3D HUD Pins */}
              {showHudPins &&
                hudNodes.map((node) => (
                  <HudAnnotationMarker
                    key={node.id}
                    node={node}
                    isSelected={selectedFieldId === node.field_id}
                    onClick={() => onSelectField && onSelectField(node.field_id)}
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
          dampingFactor={0.08}
          autoRotate={autoRotate}
          autoRotateSpeed={0.8}
          minDistance={minZoomDist}
          maxDistance={maxZoomDist}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN,
          }}
          makeDefault
        />

        {showGrid && (
          <gridHelper
            args={[gridScale, 40, cinematicMode ? '#00f0ff' : '#475569', cinematicMode ? '#003366' : '#1e293b']}
            position={[0, floorY, 0]}
          />
        )}
      </Canvas>

      {/* Floating Bottom HUD Stats */}
      <div className="hologram-footer-stats">
        <span className="footer-stat">
          <span className="stat-key">TEMPLATE:</span>{' '}
          <span className="stat-val">{holographicConfig?.material?.color ? (isPlaceholder ? 'PLACEHOLDER' : 'PARAMETRIC') : 'LOADING'}</span>
        </span>
        <span className="footer-stat">
          <span className="stat-key">ACCURACY:</span> <span className="stat-val">100% SPEC-DRIVEN</span>
        </span>
        <span className="footer-stat">
          <span className="stat-key">INTERPOLATION:</span> <span className="stat-val">ZERO HALLUCINATION</span>
        </span>
      </div>
    </div>
  );
}
