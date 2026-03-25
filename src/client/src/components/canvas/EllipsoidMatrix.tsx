import React, { useRef, useEffect } from 'react';
import { useStore, ReactFlowState } from '@xyflow/react';

const paramsMatrixConfig = {
    sizeGridCellBase: 44,
    countSegmentCurve: 20,
    intensityCurvatureBowX: 0.25,
    intensityCurvatureBowY: 0.2,
    factorSqueezeX: 1.2,
    factorSqueezeY: 1.4,
    factorParallaxPan: 0.015,
    factorParallaxZoom: 0.1,
    limitZoomMax: 1.5,
    factorLerpSmoothing: 0.08,
    hslaFallbackBackground: 'hsla(240, 10%, 2%, 1)',
    hslaFallbackLines: 'hsla(180, 100%, 50%, 0.12)',
    hslaFallbackVignette: 'hsla(240, 10%, 2%, 1)'
};

const selectorTransform = (state: ReactFlowState) => state.transform;

const colorCache = {
    background: paramsMatrixConfig.hslaFallbackBackground,
    lines: paramsMatrixConfig.hslaFallbackLines,
    gradient: 'hsla(0, 0%, 0%, 0)',
    lastUpdate: 0,
};

function refreshColors(): void {
    const now = Date.now();
    if (now - colorCache.lastUpdate < 100) return;

    const styleComputed = getComputedStyle(document.documentElement);

    const resolveColor = (varName: string, fallback: string): string => {
        const value = styleComputed.getPropertyValue(varName).trim();
        if (!value) return fallback;
        return (value.includes('(') || value.startsWith('#')) ? value : `hsla(${value})`;
    };

    colorCache.background = resolveColor('--canvas-background', paramsMatrixConfig.hslaFallbackBackground);
    colorCache.lines = resolveColor('--canvas-lines', paramsMatrixConfig.hslaFallbackLines);
    colorCache.gradient = resolveColor('--canvas-gradient', 'hsla(0, 0%, 0%, 0)');
    colorCache.lastUpdate = now;
}

export const EllipsoidMatrix: React.FC = () => {
    const refCanvasElement = useRef<HTMLCanvasElement>(null);
    const transform = useStore(selectorTransform);

    const stateLerpTarget = useRef({ tx: 0, ty: 0, tzoom: 1 });
    const stateLerpPrevious = useRef({ tx: 0, ty: 0, tzoom: 1 });
    const offsetGridAccumulated = useRef({ x: 0, y: 0 });

    useEffect(() => {
        refreshColors();

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleThemeChange = () => { colorCache.lastUpdate = 0; };
        mediaQuery.addEventListener('change', handleThemeChange);

        return () => mediaQuery.removeEventListener('change', handleThemeChange);
    }, []);

    useEffect(() => {
        const elCanvas = refCanvasElement.current;
        if (!elCanvas) return;

        const ctx = elCanvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let idAnimationFrame: number;

        const renderMatrix = () => {
            const [targetTx, targetTy, targetTzoom] = transform;

            refreshColors();
            const colorBg = colorCache.background;
            const colorLines = colorCache.lines;

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

            const getWarped = (x: number, y: number): [number, number] => {
                const rx = (x - centerX) / centerX;
                const ry = (y - centerY) / centerY;
                const sY = (rx * rx) * paramsMatrixConfig.intensityCurvatureBowY * (y - centerY);
                const sX = -(ry * ry) * paramsMatrixConfig.intensityCurvatureBowX * (x - centerX) / (1 + (tzoomCapped - 1) * 0.25);
                return [centerX + (x - centerX + sX) * (1 + (ry * ry) * (paramsMatrixConfig.factorSqueezeX - 1)), centerY + (y - centerY + sY) * (1 + (rx * rx) * (paramsMatrixConfig.factorSqueezeY - 1))];
            };

            const drawLine = (pts: [number, number][]) => {
                ctx.beginPath();
                pts.forEach(([px, py], i) => {
                    const [wx, wy] = getWarped(px, py);
                    i === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
                });
                ctx.stroke();
            };

            for (let y = -sizeGrid * 5; y < H + sizeGrid * 5; y += sizeGrid) {
                const pts: [number, number][] = [];
                for (let x = -sizeGrid; x <= W + sizeGrid; x += paramsMatrixConfig.countSegmentCurve) pts.push([x, y + offY]);
                drawLine(pts);
            }
            for (let x = -sizeGrid * 5; x < W + sizeGrid * 5; x += sizeGrid) {
                const pts: [number, number][] = [];
                for (let y = -sizeGrid; y <= H + sizeGrid; y += paramsMatrixConfig.countSegmentCurve) pts.push([x + offX, y]);
                drawLine(pts);
            }

            const colorVignetteStop1 = colorCache.gradient.replace(/[^,]+(?=\))/, ' 0');
            const colorVignetteStop2 = colorBg;

            const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.max(W, H) * 0.8);
            grad.addColorStop(0, colorVignetteStop1);
            grad.addColorStop(1, colorVignetteStop2);

            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            idAnimationFrame = requestAnimationFrame(renderMatrix);
        };

        renderMatrix();
        return () => cancelAnimationFrame(idAnimationFrame);
    }, [transform]);

    return (
        <canvas
            ref={refCanvasElement}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                zIndex: -1,
                pointerEvents: 'none'
            }}
        />
    );
};
