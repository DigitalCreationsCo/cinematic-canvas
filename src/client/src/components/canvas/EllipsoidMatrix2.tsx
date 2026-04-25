import React, { useRef, useEffect } from 'react';

const configRenderGlobeParams = {
    countLineMeridian: 118,
    countLineParallel: 90,
    countCurveSegment: 88,
    speedRotationLongitude: 0.000001,
    speedRotationLatitude: 0.0000001,
    factorRadiusViewportScale: 0.65,
    factorOffsetCenterY: 0.7,
    factorDepthPerspective: 20,
    hslaFallbackBackground: 'hsla(240, 10%, 2%, 1)',
    hslaFallbackLines: 'hsla(240, 100%, 50%, 0.12)',
    opacityFrontLines: 1.0,
    opacityBackLines: 0.05,
};

const cacheColorThemeStates = {
    colorBackground: configRenderGlobeParams.hslaFallbackBackground,
    colorLines: configRenderGlobeParams.hslaFallbackLines,
    timestampLastUpdate: 0,
};

const logDebugTrace = (messageTrace: string, dataPayload?: any): void => {
    if (process.env.NODE_ENV === 'development') {
        console.debug(`[GlobeMatrixEngine] ${messageTrace}`, dataPayload || '');
    }
};

function executeColorThemeRefresh(): void {
    const timeCurrentExecution = Date.now();
    if (timeCurrentExecution - cacheColorThemeStates.timestampLastUpdate < 100) return;

    try {
        const styleComputedDocument = getComputedStyle(document.documentElement);
        const resolveColorSafely = (nameVariableCss: string, colorFallback: string): string => {
            const valueRaw = styleComputedDocument.getPropertyValue(nameVariableCss).trim();
            if (!valueRaw) return colorFallback;
            return (valueRaw.includes('(') || valueRaw.startsWith('#')) ? valueRaw : `hsla(${valueRaw})`;
        };

        cacheColorThemeStates.colorBackground = resolveColorSafely('--canvas-background', configRenderGlobeParams.hslaFallbackBackground);
        cacheColorThemeStates.colorLines = resolveColorSafely('--canvas-lines', configRenderGlobeParams.hslaFallbackLines);
        cacheColorThemeStates.timestampLastUpdate = timeCurrentExecution;
    } catch (errorColorResolution) {
        logDebugTrace('Failed CSS theme variable resolution. Applying failsafe fallbacks.', errorColorResolution);
    }
}

export const EllipsoidMatrix2: React.FC = () => {
    const refNodeCanvasElement = useRef<HTMLCanvasElement>(null);

    useEffect(() => {

        const seedRotation = Math.random() * 10000;
        const seedOffsetX = (Math.random() - 0.5) * 40;
        const seedOffsetY = (Math.random() - 0.5) * 40;

        const nodeCanvasTarget = refNodeCanvasElement.current;
        if (!nodeCanvasTarget) return;

        const ctxCanvasRender2D = nodeCanvasTarget.getContext('2d', { alpha: false });
        if (!ctxCanvasRender2D) return;

        // Set dimensions ONCE or on RESIZE only
        let w = nodeCanvasTarget.width = window.innerWidth;
        let h = nodeCanvasTarget.height = window.innerHeight;

        const handleResize = () => {
            w = nodeCanvasTarget.width = window.innerWidth;
            h = nodeCanvasTarget.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);

        let idAnimationFrameLoop: number;

        const executeRenderCycle = () => {
            try {
                executeColorThemeRefresh();

                ctxCanvasRender2D.fillStyle = cacheColorThemeStates.colorBackground;
                ctxCanvasRender2D.fillRect(0, 0, w, h);

                const timeStampCurrent = performance.now() + seedRotation;

                const radiusBaseSphere = Math.max(w, h) * configRenderGlobeParams.factorRadiusViewportScale;
                const driftX = Math.sin(performance.now() * 0.0005) * 10;
                const coordinateCenterX = (w / 2) + seedOffsetX + driftX;
                const coordinateCenterY = (h * configRenderGlobeParams.factorOffsetCenterY) + seedOffsetY;

                const angleRotationLat = timeStampCurrent * configRenderGlobeParams.speedRotationLatitude;
                const angleRotationLon = timeStampCurrent * configRenderGlobeParams.speedRotationLongitude;

                const cacheCosLat = Math.cos(angleRotationLat);
                const cacheSinLat = Math.sin(angleRotationLat);
                const cacheCosLon = Math.cos(angleRotationLon);
                const cacheSinLon = Math.sin(angleRotationLon);

                const mapSphericalToViewPlane = (angleThetaLong: number, anglePhiLat: number) => {
                    const coordinateX3D = radiusBaseSphere * Math.cos(anglePhiLat) * Math.cos(angleThetaLong);
                    const coordinateY3D = radiusBaseSphere * Math.sin(anglePhiLat);
                    const coordinateZ3D = radiusBaseSphere * Math.cos(anglePhiLat) * Math.sin(angleThetaLong);

                    const rotatedLatY = coordinateY3D * cacheCosLat - coordinateZ3D * cacheSinLat;
                    const rotatedLatZ = coordinateY3D * cacheSinLat + coordinateZ3D * cacheCosLat;

                    const rotatedLonX = coordinateX3D * cacheCosLon - rotatedLatZ * cacheSinLon;
                    const rotatedLonZ = coordinateX3D * cacheSinLon + rotatedLatZ * cacheCosLon;

                    const limitFieldOfView = radiusBaseSphere * configRenderGlobeParams.factorDepthPerspective;
                    const factorScalePerspective = limitFieldOfView / (limitFieldOfView + rotatedLonZ);

                    return {
                        coordScreenX: coordinateCenterX + rotatedLonX * factorScalePerspective,
                        coordScreenY: coordinateCenterY + rotatedLatY * factorScalePerspective,
                        isFacingFront: rotatedLonZ < 0
                    };
                };

                const pathLinesFront = new Path2D();
                const pathLinesBack = new Path2D();

                for (let indexLat = 1; indexLat < configRenderGlobeParams.countLineParallel; indexLat++) {
                    const anglePhiCurrent = (indexLat / configRenderGlobeParams.countLineParallel) * Math.PI - Math.PI / 2;
                    let stateIsFirstSegmentFront = true;
                    let stateIsFirstSegmentBack = true;

                    for (let indexLon = 0; indexLon <= configRenderGlobeParams.countCurveSegment; indexLon++) {
                        const angleThetaCurrent = (indexLon / configRenderGlobeParams.countCurveSegment) * Math.PI * 2;
                        const payloadProjection = mapSphericalToViewPlane(angleThetaCurrent, anglePhiCurrent);

                        if (payloadProjection.isFacingFront) {
                            stateIsFirstSegmentFront ? pathLinesFront.moveTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY) : pathLinesFront.lineTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY);
                            stateIsFirstSegmentFront = false;
                            stateIsFirstSegmentBack = true;
                        } else {
                            stateIsFirstSegmentBack ? pathLinesBack.moveTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY) : pathLinesBack.lineTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY);
                            stateIsFirstSegmentBack = false;
                            stateIsFirstSegmentFront = true;
                        }
                    }
                }

                for (let indexLon = 0; indexLon < configRenderGlobeParams.countLineMeridian; indexLon++) {
                    const angleThetaCurrent = (indexLon / configRenderGlobeParams.countLineMeridian) * Math.PI * 2;
                    let stateIsFirstSegmentFront = true;
                    let stateIsFirstSegmentBack = true;

                    for (let indexLat = 0; indexLat <= configRenderGlobeParams.countCurveSegment; indexLat++) {
                        const anglePhiCurrent = (indexLat / configRenderGlobeParams.countCurveSegment) * Math.PI - Math.PI / 2;
                        const payloadProjection = mapSphericalToViewPlane(angleThetaCurrent, anglePhiCurrent);

                        if (payloadProjection.isFacingFront) {
                            stateIsFirstSegmentFront ? pathLinesFront.moveTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY) : pathLinesFront.lineTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY);
                            stateIsFirstSegmentFront = false;
                            stateIsFirstSegmentBack = true;
                        } else {
                            stateIsFirstSegmentBack ? pathLinesBack.moveTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY) : pathLinesBack.lineTo(payloadProjection.coordScreenX, payloadProjection.coordScreenY);
                            stateIsFirstSegmentBack = false;
                            stateIsFirstSegmentFront = true;
                        }
                    }
                }

                ctxCanvasRender2D.strokeStyle = cacheColorThemeStates.colorLines;
                ctxCanvasRender2D.globalAlpha = configRenderGlobeParams.opacityBackLines;
                ctxCanvasRender2D.lineWidth = 0.3;
                ctxCanvasRender2D.stroke(pathLinesBack);

                ctxCanvasRender2D.globalAlpha = configRenderGlobeParams.opacityFrontLines;
                ctxCanvasRender2D.lineWidth = 0.5;
                ctxCanvasRender2D.stroke(pathLinesFront);
                ctxCanvasRender2D.globalAlpha = 1.0;

                const colorGradientRadialCore = cacheColorThemeStates.colorBackground.replace(/[^,]+(?=\))/, ' 0');
                const fillGradientVignetteOverlay = ctxCanvasRender2D.createRadialGradient(
                    coordinateCenterX, coordinateCenterY, 0,
                    coordinateCenterX, coordinateCenterY, Math.max(w, h) * 0.9
                );
                fillGradientVignetteOverlay.addColorStop(0, colorGradientRadialCore);
                fillGradientVignetteOverlay.addColorStop(1, cacheColorThemeStates.colorBackground);

                ctxCanvasRender2D.fillStyle = fillGradientVignetteOverlay;
                ctxCanvasRender2D.fillRect(0, 0, w, h);

                idAnimationFrameLoop = requestAnimationFrame(executeRenderCycle);

            } catch (errorUncaughtExecution) {
                logDebugTrace('Fatal frame exception caught. Thread terminated to prevent cyclic memory leaks.', errorUncaughtExecution);
                cancelAnimationFrame(idAnimationFrameLoop);
            }
        };

        executeRenderCycle();
        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(idAnimationFrameLoop);
        };
    }, []);

    return <canvas ref={refNodeCanvasElement} className="absolute inset-0 -z-10 pointer-events-none" />;
};