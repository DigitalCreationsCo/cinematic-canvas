import React, { useRef, useEffect } from 'react';
import { useStore, ReactFlowState } from '@xyflow/react';

/**
 * STATIC CONFIGURATION
 * Descriptive naming following the least-to-most-descriptive convention.
 */
const paramsMatrixConfig = {
    sizeGridCellBase: 44,
    countSegmentCurve: 20,
    intensityCurvatureBow: 0.3,
    factorSqueezeX: 1.1,
    factorSqueezeY: 1.3,
    factorParallaxPan: 0.015,
    factorParallaxZoom: 0.25,
    limitZoomMax: 1.5,
    factorLerpSmoothing: 0.08,
    // HSLA Fallbacks
    hslaFallbackBackground: 'hsla(240, 10%, 2%, 1)',
    hslaFallbackLines: 'hsla(180, 100%, 50%, 0.12)',
    hslaFallbackVignette: 'hsla(240, 10%, 2%, 1)'
};

const selectorTransform = (state: ReactFlowState) => state.transform;

export const EllipsoidMatrix: React.FC = () => {
    const refCanvasElement = useRef<HTMLCanvasElement>(null);
    const transform = useStore(selectorTransform);

    const stateLerpTarget = useRef({ tx: 0, ty: 0, tzoom: 1 });
    const stateLerpPrevious = useRef({ tx: 0, ty: 0, tzoom: 1 });
    const offsetGridAccumulated = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const elCanvas = refCanvasElement.current;
        if (!elCanvas) return;

        const ctx = elCanvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let idAnimationFrame: number;

        const renderMatrix = () => {
            const [ targetTx, targetTy, targetTzoom ] = transform;
            const styleComputed = getComputedStyle(document.documentElement);

            /**
             * RESOLUTION ENGINE
             * Directly converts CSS variables to Canvas-safe HSLA strings.
             */
            const resolveColor = (varName: string, fallback: string): string => {
                const value = styleComputed.getPropertyValue(varName).trim();
                if (!value) return fallback;
                // Supports raw space-separated values or full hsla() functions
                return (value.includes('(') || value.startsWith('#')) ? value : `hsla(${value})`;
            };

            const colorBg = resolveColor('--background', paramsMatrixConfig.hslaFallbackBackground);
            const colorLines = resolveColor('--border', paramsMatrixConfig.hslaFallbackLines);

            // ── Vignette Stop Resolution ──────────────────────────────────
            // Logic: Stop 1 uses background variable but forces 0 alpha for center transparency
            const colorVignetteStop1 = resolveColor('--muted', 'hsla(0, 0%, 0%, 0)').replace(/[^,]+(?=\))/, ' 0');
            const colorVignetteStop2 = colorBg;

            // ── LERP & Parallax ───────────────────────────────────────────
            stateLerpTarget.current.tx += (targetTx - stateLerpTarget.current.tx) * paramsMatrixConfig.factorLerpSmoothing;
            stateLerpTarget.current.ty += (targetTy - stateLerpTarget.current.ty) * paramsMatrixConfig.factorLerpSmoothing;
            stateLerpTarget.current.tzoom += (targetTzoom - stateLerpTarget.current.tzoom) * paramsMatrixConfig.factorLerpSmoothing;

            const { tx, ty, tzoom } = stateLerpTarget.current;
            const tzoomCapped = Math.min(tzoom, paramsMatrixConfig.limitZoomMax);
            const sizeGrid = paramsMatrixConfig.sizeGridCellBase * (1 + (tzoomCapped - 1) * paramsMatrixConfig.factorParallaxZoom);

            const prev = stateLerpPrevious.current;
            const ratioZoom = tzoom / prev.tzoom;
            if (Math.abs(ratioZoom - 1) > 0.0001) {
                const cx = (tx - prev.tx * ratioZoom) / (1 - ratioZoom);
                const cy = (ty - prev.ty * ratioZoom) / (1 - ratioZoom);
                const ratioDamped = (1 + (tzoomCapped - 1) * paramsMatrixConfig.factorParallaxZoom) / (1 + (Math.min(prev.tzoom, paramsMatrixConfig.limitZoomMax) - 1) * paramsMatrixConfig.factorParallaxZoom);
                offsetGridAccumulated.current.x = cx + (offsetGridAccumulated.current.x - cx) * ratioDamped;
                offsetGridAccumulated.current.y = cy + (offsetGridAccumulated.current.y - cy) * ratioDamped;
            } else {
                offsetGridAccumulated.current.x += (tx - prev.tx) * paramsMatrixConfig.factorParallaxPan;
                offsetGridAccumulated.current.y += (ty - prev.ty) * paramsMatrixConfig.factorParallaxPan;
            }
            stateLerpPrevious.current = { tx, ty, tzoom };

            // ── Render ────────────────────────────────────────────────────
            const W = elCanvas.width = window.innerWidth;
            const H = elCanvas.height = window.innerHeight;
            const centerX = W / 2;
            const centerY = H / 2;

            ctx.fillStyle = colorBg;
            ctx.fillRect(0, 0, W, H);

            const offX = ((offsetGridAccumulated.current.x % sizeGrid) + sizeGrid) % sizeGrid;
            const offY = ((offsetGridAccumulated.current.y % sizeGrid) + sizeGrid) % sizeGrid;

            ctx.strokeStyle = colorLines;
            ctx.lineWidth = Math.max(0.3, 0.5 * tzoomCapped);

            const getWarped = (x: number, y: number): [ number, number ] => {
                const rx = (x - centerX) / centerX;
                const ry = (y - centerY) / centerY;
                const sY = (rx * rx) * paramsMatrixConfig.intensityCurvatureBow * (y - centerY);
                const sX = -(ry * ry) * paramsMatrixConfig.intensityCurvatureBow * (x - centerX);
                return [ centerX + (x - centerX + sX) * (1 + (ry * ry) * (paramsMatrixConfig.factorSqueezeX - 1)), centerY + (y - centerY + sY) * (1 + (rx * rx) * (paramsMatrixConfig.factorSqueezeY - 1)) ];
            };

            const drawLine = (pts: [ number, number ][]) => {
                ctx.beginPath();
                pts.forEach(([ px, py ], i) => {
                    const [ wx, wy ] = getWarped(px, py);
                    i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
                });
                ctx.stroke();
            };

            for (let y = -sizeGrid * 5; y < H + sizeGrid * 5; y += sizeGrid) {
                const pts: [ number, number ][] = [];
                for (let x = -sizeGrid; x <= W + sizeGrid; x += paramsMatrixConfig.countSegmentCurve) pts.push([ x, y + offY ]);
                drawLine(pts);
            }
            for (let x = -sizeGrid * 5; x < W + sizeGrid * 5; x += sizeGrid) {
                const pts: [ number, number ][] = [];
                for (let y = -sizeGrid; y <= H + sizeGrid; y += paramsMatrixConfig.countSegmentCurve) pts.push([ x + offX, y ]);
                drawLine(pts);
            }

            // ── Vignette Layer ────────────────────────────────────────────
            const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(W, H) * 0.8);
            grad.addColorStop(0, colorVignetteStop1);
            grad.addColorStop(1, colorVignetteStop2);

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            idAnimationFrame = requestAnimationFrame(renderMatrix);
        };

        renderMatrix();
        return () => cancelAnimationFrame(idAnimationFrame);
    }, [ transform ]);

    return (
        <canvas
            ref={ refCanvasElement }
            style={ {
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -1,
                pointerEvents: 'none'
            } }
        />
    );
};