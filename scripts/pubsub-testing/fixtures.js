"use strict";
/**
 * Test fixtures for pubsub testing
 * Provides type-safe factories for creating test Project and Job payloads
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestScenarios = exports.createJobEvent = exports.createFullStateEvent = exports.createTestJob = exports.createJobPayload = exports.createTestProject = exports.createTestProjectMetadata = exports.createTestLocation = exports.createTestCharacter = exports.createTestScene = exports.jobControlPlane = void 0;
var uuid_1 = require("uuid");
var index_js_1 = require("../../src/shared/types/index.js");
var job_control_plane_js_1 = require("../../src/shared/services/job-control-plane.js");
var pool_manager_js_1 = require("../../src/shared/services/pool-manager.js");
var index_js_2 = require("../../src/shared/db/index.js");
(0, index_js_2.initializeDatabase)((0, index_js_2.getPool)());
var poolManager = new pool_manager_js_1.PoolManager({ enableMetrics: false });
exports.jobControlPlane = new job_control_plane_js_1.JobControlPlane(poolManager, function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/];
}); }); }); // use external dispatcher
// ============================================================================
// TEST DATA FACTORIES
// ============================================================================
var createTestScene = function (overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9;
    var projectId = (_a = overrides === null || overrides === void 0 ? void 0 : overrides.projectId) !== null && _a !== void 0 ? _a : (0, uuid_1.v7)();
    var timestamp = new Date();
    var sceneIndex = (_b = overrides === null || overrides === void 0 ? void 0 : overrides.sceneIndex) !== null && _b !== void 0 ? _b : 0;
    return {
        // IdentityBase
        id: (_c = overrides === null || overrides === void 0 ? void 0 : overrides.id) !== null && _c !== void 0 ? _c : (0, uuid_1.v7)(),
        createdAt: (_d = overrides === null || overrides === void 0 ? void 0 : overrides.createdAt) !== null && _d !== void 0 ? _d : timestamp,
        updatedAt: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.updatedAt) !== null && _e !== void 0 ? _e : timestamp,
        // ProjectRef
        projectId: projectId,
        // SceneAttributes
        sceneIndex: sceneIndex,
        lighting: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.lighting) !== null && _f !== void 0 ? _f : {
            quality: {
                hardness: "Soft",
                colorTemperature: "Neutral",
                intensity: "Medium",
            },
            motivatedSources: {
                primaryLight: "Sun through window",
                fillLight: "Ambient skylight",
                practicalLights: "",
                accentLight: "",
                lightBeams: "None",
            },
            direction: {
                keyLightPosition: "Front-left 45°",
                shadowDirection: "Falling right",
                contrastRatio: "Medium(1:4)",
            },
            atmosphere: {
                haze: "None",
            },
        },
        // Cinematography
        shotType: (_g = overrides === null || overrides === void 0 ? void 0 : overrides.shotType) !== null && _g !== void 0 ? _g : "Medium Close-Up",
        cameraAngle: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.cameraAngle) !== null && _h !== void 0 ? _h : "Eye Level",
        cameraMovement: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.cameraMovement) !== null && _j !== void 0 ? _j : "Static",
        transitionType: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.transitionType) !== null && _k !== void 0 ? _k : "none",
        composition: (_l = overrides === null || overrides === void 0 ? void 0 : overrides.composition) !== null && _l !== void 0 ? _l : {
            "Subject Placement": "Center",
            "Focal Point": "Center",
            "Depth Layers": "Midground",
            "Leading Lines": "None",
            "Headroom": "Standard",
            "Look Room": "None",
        },
        // AudioSegmentAttributes
        startTime: (_m = overrides === null || overrides === void 0 ? void 0 : overrides.startTime) !== null && _m !== void 0 ? _m : sceneIndex * 5,
        endTime: (_o = overrides === null || overrides === void 0 ? void 0 : overrides.endTime) !== null && _o !== void 0 ? _o : (sceneIndex + 1) * 5,
        duration: (_p = overrides === null || overrides === void 0 ? void 0 : overrides.duration) !== null && _p !== void 0 ? _p : 5,
        type: (_q = overrides === null || overrides === void 0 ? void 0 : overrides.type) !== null && _q !== void 0 ? _q : "lyrical",
        lyrics: (_r = overrides === null || overrides === void 0 ? void 0 : overrides.lyrics) !== null && _r !== void 0 ? _r : "",
        musicalDescription: (_s = overrides === null || overrides === void 0 ? void 0 : overrides.musicalDescription) !== null && _s !== void 0 ? _s : "Ambient background music",
        musicChange: (_t = overrides === null || overrides === void 0 ? void 0 : overrides.musicChange) !== null && _t !== void 0 ? _t : "None",
        intensity: (_u = overrides === null || overrides === void 0 ? void 0 : overrides.intensity) !== null && _u !== void 0 ? _u : "medium",
        mood: (_v = overrides === null || overrides === void 0 ? void 0 : overrides.mood) !== null && _v !== void 0 ? _v : "neutral",
        tempo: (_w = overrides === null || overrides === void 0 ? void 0 : overrides.tempo) !== null && _w !== void 0 ? _w : "moderate",
        audioEvidence: (_x = overrides === null || overrides === void 0 ? void 0 : overrides.audioEvidence) !== null && _x !== void 0 ? _x : "Soft instrumental music",
        transientImpact: (_y = overrides === null || overrides === void 0 ? void 0 : overrides.transientImpact) !== null && _y !== void 0 ? _y : "soft",
        // DirectorScene
        name: (_z = overrides === null || overrides === void 0 ? void 0 : overrides.name) !== null && _z !== void 0 ? _z : "Scene ".concat(sceneIndex + 1),
        description: (_0 = overrides === null || overrides === void 0 ? void 0 : overrides.description) !== null && _0 !== void 0 ? _0 : "A test scene for debugging",
        audioSync: (_1 = overrides === null || overrides === void 0 ? void 0 : overrides.audioSync) !== null && _1 !== void 0 ? _1 : "Mood Sync",
        // ScriptSupervisorScene
        characterReferenceIds: (_2 = overrides === null || overrides === void 0 ? void 0 : overrides.characterReferenceIds) !== null && _2 !== void 0 ? _2 : [],
        locationReferenceId: (_3 = overrides === null || overrides === void 0 ? void 0 : overrides.locationReferenceId) !== null && _3 !== void 0 ? _3 : "loc_test",
        continuityNotes: (_4 = overrides === null || overrides === void 0 ? void 0 : overrides.continuityNotes) !== null && _4 !== void 0 ? _4 : [],
        // ScriptSupervisorScene (additional fields from .pick())
        characterIds: (_5 = overrides === null || overrides === void 0 ? void 0 : overrides.characterIds) !== null && _5 !== void 0 ? _5 : [],
        locationId: (_6 = overrides === null || overrides === void 0 ? void 0 : overrides.locationId) !== null && _6 !== void 0 ? _6 : null,
        // SceneStatus
        status: (_7 = overrides === null || overrides === void 0 ? void 0 : overrides.status) !== null && _7 !== void 0 ? _7 : "pending",
        progressMessage: (_8 = overrides === null || overrides === void 0 ? void 0 : overrides.progressMessage) !== null && _8 !== void 0 ? _8 : "",
        // AssetRegistry
        assets: (_9 = overrides === null || overrides === void 0 ? void 0 : overrides.assets) !== null && _9 !== void 0 ? _9 : index_js_1.AssetRegistry.parse({}),
    };
};
exports.createTestScene = createTestScene;
var createTestCharacter = function (overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    var projectId = (_a = overrides === null || overrides === void 0 ? void 0 : overrides.projectId) !== null && _a !== void 0 ? _a : (0, uuid_1.v7)();
    var timestamp = new Date();
    return {
        // IdentityBase
        id: (_b = overrides === null || overrides === void 0 ? void 0 : overrides.id) !== null && _b !== void 0 ? _b : (0, uuid_1.v7)(),
        createdAt: (_c = overrides === null || overrides === void 0 ? void 0 : overrides.createdAt) !== null && _c !== void 0 ? _c : timestamp,
        updatedAt: (_d = overrides === null || overrides === void 0 ? void 0 : overrides.updatedAt) !== null && _d !== void 0 ? _d : timestamp,
        // ProjectRef
        projectId: projectId,
        // CharacterAttributes
        referenceId: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.referenceId) !== null && _e !== void 0 ? _e : "char-".concat(Math.random().toString(36).slice(2, 8)),
        name: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.name) !== null && _f !== void 0 ? _f : "Test Character",
        aliases: (_g = overrides === null || overrides === void 0 ? void 0 : overrides.aliases) !== null && _g !== void 0 ? _g : [],
        physicalTraits: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.physicalTraits) !== null && _h !== void 0 ? _h : {
            age: "30s",
            hair: "short dark hair",
            clothing: ["casual t-shirt", "jeans"],
            accessories: [],
            distinctiveFeatures: [],
            build: "average",
            ethnicity: "",
            appearanceNotes: [],
        },
        state: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.state) !== null && _j !== void 0 ? _j : {
            emotionalState: "calm",
            emotionalHistory: [],
            injuries: [],
            dirtLevel: "clean",
            exhaustionLevel: "fresh",
        },
        // AssetRegistry
        assets: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.assets) !== null && _k !== void 0 ? _k : index_js_1.AssetRegistry.parse({}),
    };
};
exports.createTestCharacter = createTestCharacter;
var createTestLocation = function (overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    var projectId = (_a = overrides === null || overrides === void 0 ? void 0 : overrides.projectId) !== null && _a !== void 0 ? _a : (0, uuid_1.v7)();
    var timestamp = new Date();
    return {
        // IdentityBase
        id: (_b = overrides === null || overrides === void 0 ? void 0 : overrides.id) !== null && _b !== void 0 ? _b : (0, uuid_1.v7)(),
        createdAt: (_c = overrides === null || overrides === void 0 ? void 0 : overrides.createdAt) !== null && _c !== void 0 ? _c : timestamp,
        updatedAt: (_d = overrides === null || overrides === void 0 ? void 0 : overrides.updatedAt) !== null && _d !== void 0 ? _d : timestamp,
        // ProjectRef
        projectId: projectId,
        // LocationAttributes
        referenceId: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.referenceId) !== null && _e !== void 0 ? _e : "loc-".concat(Math.random().toString(36).slice(2, 8)),
        name: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.name) !== null && _f !== void 0 ? _f : "Test Location",
        type: (_g = overrides === null || overrides === void 0 ? void 0 : overrides.type) !== null && _g !== void 0 ? _g : "interior",
        lightingConditions: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.lightingConditions) !== null && _h !== void 0 ? _h : {
            quality: {
                hardness: "Soft",
                colorTemperature: "Neutral",
                intensity: "Medium",
            },
            motivatedSources: {
                primaryLight: "Overhead ceiling lights",
                fillLight: "Ambient reflection",
                practicalLights: "",
                accentLight: "",
                lightBeams: "None",
            },
            direction: {
                keyLightPosition: "Overhead",
                shadowDirection: "Below",
                contrastRatio: "Low(1:2)",
            },
            atmosphere: {
                haze: "None",
            },
        },
        mood: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.mood) !== null && _j !== void 0 ? _j : "Serene",
        timeOfDay: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.timeOfDay) !== null && _k !== void 0 ? _k : "Day",
        weather: (_l = overrides === null || overrides === void 0 ? void 0 : overrides.weather) !== null && _l !== void 0 ? _l : "Clear",
        colorPalette: (_m = overrides === null || overrides === void 0 ? void 0 : overrides.colorPalette) !== null && _m !== void 0 ? _m : [],
        architecture: (_o = overrides === null || overrides === void 0 ? void 0 : overrides.architecture) !== null && _o !== void 0 ? _o : [],
        naturalElements: (_p = overrides === null || overrides === void 0 ? void 0 : overrides.naturalElements) !== null && _p !== void 0 ? _p : [],
        manMadeObjects: (_q = overrides === null || overrides === void 0 ? void 0 : overrides.manMadeObjects) !== null && _q !== void 0 ? _q : [],
        groundSurface: (_r = overrides === null || overrides === void 0 ? void 0 : overrides.groundSurface) !== null && _r !== void 0 ? _r : "Hardwood floor",
        skyOrCeiling: (_s = overrides === null || overrides === void 0 ? void 0 : overrides.skyOrCeiling) !== null && _s !== void 0 ? _s : "White ceiling",
        state: (_t = overrides === null || overrides === void 0 ? void 0 : overrides.state) !== null && _t !== void 0 ? _t : {
            lastUsed: "",
            mood: "Serene",
            timeOfDay: "Day",
            weather: "Clear",
            timeHistory: [],
            weatherHistory: [],
            precipitation: "none",
            visibility: "clear",
            lighting: {
                quality: {
                    hardness: "Soft",
                    colorTemperature: "Neutral",
                    intensity: "Medium",
                },
                motivatedSources: {
                    primaryLight: "Overhead",
                    fillLight: "Ambient",
                    practicalLights: "",
                    accentLight: "",
                    lightBeams: "None",
                },
                direction: {
                    keyLightPosition: "Overhead",
                    shadowDirection: "Below",
                    contrastRatio: "Low(1:2)",
                },
                atmosphere: {
                    haze: "None",
                },
            },
            lightingHistory: [],
            groundCondition: {
                wetness: "dry",
                debris: [],
                damage: [],
            },
            atmosphericEffects: [],
            season: "unspecified",
            temperatureIndicators: [],
        },
        // AssetRegistry
        assets: (_u = overrides === null || overrides === void 0 ? void 0 : overrides.assets) !== null && _u !== void 0 ? _u : index_js_1.AssetRegistry.parse({}),
    };
};
exports.createTestLocation = createTestLocation;
var createTestProjectMetadata = function (overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    return ({
        title: (_a = overrides === null || overrides === void 0 ? void 0 : overrides.title) !== null && _a !== void 0 ? _a : "Test Project",
        aspectRatio: (_b = overrides === null || overrides === void 0 ? void 0 : overrides.aspectRatio) !== null && _b !== void 0 ? _b : "widescreen",
        targetDuration: (_c = overrides === null || overrides === void 0 ? void 0 : overrides.targetDuration) !== null && _c !== void 0 ? _c : 60,
        stylePreset: (_d = overrides === null || overrides === void 0 ? void 0 : overrides.stylePreset) !== null && _d !== void 0 ? _d : "cinematic",
        initialPrompt: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.initialPrompt) !== null && _e !== void 0 ? _e : "A test creative project",
        enhancedPrompt: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.enhancedPrompt) !== null && _f !== void 0 ? _f : "An elaborated creative vision for testing",
        hasAudio: (_g = overrides === null || overrides === void 0 ? void 0 : overrides.hasAudio) !== null && _g !== void 0 ? _g : false,
        audioGcsUri: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.audioGcsUri) !== null && _h !== void 0 ? _h : null,
        audioPublicUri: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.audioPublicUri) !== null && _j !== void 0 ? _j : null,
        durationSeconds: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.durationSeconds) !== null && _k !== void 0 ? _k : null,
        tempoBpm: (_l = overrides === null || overrides === void 0 ? void 0 : overrides.tempoBpm) !== null && _l !== void 0 ? _l : null,
        keySignature: (_m = overrides === null || overrides === void 0 ? void 0 : overrides.keySignature) !== null && _m !== void 0 ? _m : null,
    });
};
exports.createTestProjectMetadata = createTestProjectMetadata;
var createTestProject = function (overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    var projectId = (_a = overrides === null || overrides === void 0 ? void 0 : overrides.id) !== null && _a !== void 0 ? _a : (0, uuid_1.v7)();
    var timestamp = new Date();
    var scenes = (_b = overrides === null || overrides === void 0 ? void 0 : overrides.scenes) !== null && _b !== void 0 ? _b : [
        (0, exports.createTestScene)({ projectId: projectId, sceneIndex: 0, name: "Opening Scene" }),
        (0, exports.createTestScene)({ projectId: projectId, sceneIndex: 1, name: "Middle Scene" }),
    ];
    var characters = (_c = overrides === null || overrides === void 0 ? void 0 : overrides.characters) !== null && _c !== void 0 ? _c : [(0, exports.createTestCharacter)({ projectId: projectId, name: "Protagonist" })];
    var locations = (_d = overrides === null || overrides === void 0 ? void 0 : overrides.locations) !== null && _d !== void 0 ? _d : [(0, exports.createTestLocation)({ projectId: projectId, name: "Main Location" })];
    // Create storyboard versions without assets
    var storyboardScenes = scenes.map(function (s) {
        var assets = s.assets, rest = __rest(s, ["assets"]);
        return rest;
    });
    var storyboardCharacters = characters.map(function (c) {
        var assets = c.assets, state = c.state, rest = __rest(c, ["assets", "state"]);
        return rest;
    });
    var storyboardLocations = locations.map(function (l) {
        var assets = l.assets, state = l.state, rest = __rest(l, ["assets", "state"]);
        return rest;
    });
    return {
        // IdentityBase
        id: projectId,
        createdAt: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.createdAt) !== null && _e !== void 0 ? _e : timestamp,
        updatedAt: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.updatedAt) !== null && _f !== void 0 ? _f : timestamp,
        // ProjectBase
        storyboard: (_g = overrides === null || overrides === void 0 ? void 0 : overrides.storyboard) !== null && _g !== void 0 ? _g : {
            metadata: (0, exports.createTestProjectMetadata)(),
            scenes: storyboardScenes,
            characters: storyboardCharacters,
            locations: storyboardLocations,
        },
        metadata: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.metadata) !== null && _h !== void 0 ? _h : (0, exports.createTestProjectMetadata)(),
        audioAnalysis: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.audioAnalysis) !== null && _j !== void 0 ? _j : null,
        metrics: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.metrics) !== null && _k !== void 0 ? _k : index_js_1.WorkflowMetrics.parse({}),
        generationRules: (_l = overrides === null || overrides === void 0 ? void 0 : overrides.generationRules) !== null && _l !== void 0 ? _l : [],
        generationRulesHistory: (_m = overrides === null || overrides === void 0 ? void 0 : overrides.generationRulesHistory) !== null && _m !== void 0 ? _m : [],
        currentSceneIndex: (_o = overrides === null || overrides === void 0 ? void 0 : overrides.currentSceneIndex) !== null && _o !== void 0 ? _o : 0,
        status: (_p = overrides === null || overrides === void 0 ? void 0 : overrides.status) !== null && _p !== void 0 ? _p : "pending",
        forceRegenerateSceneIds: (_q = overrides === null || overrides === void 0 ? void 0 : overrides.forceRegenerateSceneIds) !== null && _q !== void 0 ? _q : [],
        assets: (_r = overrides === null || overrides === void 0 ? void 0 : overrides.assets) !== null && _r !== void 0 ? _r : index_js_1.AssetRegistry.parse({}),
        // Extended arrays
        scenes: scenes,
        characters: characters,
        locations: locations,
    };
};
exports.createTestProject = createTestProject;
// ============================================================================
// JOB PAYLOAD FACTORIES
// ============================================================================
var createJobPayload = function (type, overrides) {
    var basePayloads = {
        EXPAND_CREATIVE_PROMPT: {},
        GENERATE_STORYBOARD: {},
        PROCESS_AUDIO_TO_SCENES: {},
        ENHANCE_STORYBOARD: {},
        SEMANTIC_ANALYSIS: {},
        GENERATE_CHARACTER_ASSETS: {
            characters: [(0, exports.createTestCharacter)(overrides)],
        },
        GENERATE_LOCATION_ASSETS: {
            locations: [(0, exports.createTestLocation)(overrides)],
        },
        GENERATE_SCENE_FRAMES: {
            sceneIds: [],
            assetKeys: ["scene_start_frame", "scene_end_frame"],
            promptModifications: [],
        },
        GENERATE_SCENE_VIDEO: {
            sceneId: (0, uuid_1.v7)(),
            overridePrompt: "Generate with enhanced lighting",
        },
        RENDER_VIDEO: {
            videoPaths: [],
            audioGcsUri: null,
        },
    };
    return __assign(__assign({}, basePayloads[type]), overrides);
};
exports.createJobPayload = createJobPayload;
var createTestJob = function (type, overrides) { return __awaiter(void 0, void 0, void 0, function () {
    var projectId, timestamp, assetKeyMap, insertJob;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    return __generator(this, function (_p) {
        switch (_p.label) {
            case 0:
                projectId = (_a = overrides === null || overrides === void 0 ? void 0 : overrides.projectId) !== null && _a !== void 0 ? _a : (0, uuid_1.v7)();
                timestamp = new Date();
                assetKeyMap = {
                    EXPAND_CREATIVE_PROMPT: "enhanced_prompt",
                    GENERATE_STORYBOARD: "storyboard",
                    PROCESS_AUDIO_TO_SCENES: "audio_analysis",
                    ENHANCE_STORYBOARD: "storyboard",
                    SEMANTIC_ANALYSIS: "generation_rules",
                    GENERATE_CHARACTER_ASSETS: "character_image",
                    GENERATE_LOCATION_ASSETS: "location_image",
                    GENERATE_SCENE_FRAMES: "scene_start_frame",
                    GENERATE_SCENE_VIDEO: "scene_video",
                    RENDER_VIDEO: "final_output",
                };
                insertJob = {
                    id: (_b = overrides === null || overrides === void 0 ? void 0 : overrides.id) !== null && _b !== void 0 ? _b : (0, uuid_1.v7)(),
                    projectId: projectId,
                    type: type,
                    state: ((_c = overrides === null || overrides === void 0 ? void 0 : overrides.state) !== null && _c !== void 0 ? _c : "PENDING"),
                    assetKey: ((_d = overrides === null || overrides === void 0 ? void 0 : overrides.assetKey) !== null && _d !== void 0 ? _d : assetKeyMap[type]),
                    uniqueKey: (_e = overrides === null || overrides === void 0 ? void 0 : overrides.uniqueKey) !== null && _e !== void 0 ? _e : "test-".concat(type, "-").concat(Date.now()),
                    payload: (_f = overrides === null || overrides === void 0 ? void 0 : overrides.payload) !== null && _f !== void 0 ? _f : (0, exports.createJobPayload)(type, (_g = overrides === null || overrides === void 0 ? void 0 : overrides.payload) !== null && _g !== void 0 ? _g : {}),
                    result: (_h = overrides === null || overrides === void 0 ? void 0 : overrides.result) !== null && _h !== void 0 ? _h : null,
                    attempts: (_j = overrides === null || overrides === void 0 ? void 0 : overrides.attempts) !== null && _j !== void 0 ? _j : {
                        currentAttempt: 1,
                        totalAttempts: 1,
                        maxRetries: 3,
                        lastAttemptAt: timestamp,
                        failureHistory: [],
                    },
                    recoveryContext: (_k = overrides === null || overrides === void 0 ? void 0 : overrides.recoveryContext) !== null && _k !== void 0 ? _k : null,
                    createdAt: (_l = overrides === null || overrides === void 0 ? void 0 : overrides.createdAt) !== null && _l !== void 0 ? _l : timestamp,
                    updatedAt: (_m = overrides === null || overrides === void 0 ? void 0 : overrides.updatedAt) !== null && _m !== void 0 ? _m : timestamp,
                    error: (_o = overrides === null || overrides === void 0 ? void 0 : overrides.error) !== null && _o !== void 0 ? _o : "",
                };
                return [4 /*yield*/, exports.jobControlPlane.createJob(insertJob)];
            case 1: return [2 /*return*/, _p.sent()];
        }
    });
}); };
exports.createTestJob = createTestJob;
var createFullStateEvent = function (project) {
    var _a;
    return ({
        type: "FULL_STATE",
        projectId: (_a = project === null || project === void 0 ? void 0 : project.id) !== null && _a !== void 0 ? _a : "test-project-id",
        commandId: "test-command-id",
        timestamp: new Date().toISOString(),
        payload: { project: project !== null && project !== void 0 ? project : (0, exports.createTestProject)() },
    });
};
exports.createFullStateEvent = createFullStateEvent;
var createJobEvent = function (type, jobId, projectId, error) {
    switch (type) {
        case "JOB_DISPATCHED":
            return { type: type, jobId: jobId, projectId: projectId };
        case "JOB_STARTED":
            return { type: type, jobId: jobId };
        case "JOB_COMPLETED":
            return { type: type, jobId: jobId, projectId: projectId };
        case "JOB_FAILED":
            return { type: type, jobId: jobId, error: error !== null && error !== void 0 ? error : "Test failure" };
        case "JOB_CANCELLED":
            return { type: type, jobId: jobId };
    }
};
exports.createJobEvent = createJobEvent;
// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================
exports.TestScenarios = {
    minimalProject: function () { return (0, exports.createTestProject)({
        scenes: [],
        characters: [],
        locations: [],
    }); },
    richStoryboard: function () {
        var projectId = (0, uuid_1.v7)();
        var scenes = Array.from({ length: 5 }, function (_, i) {
            return (0, exports.createTestScene)({
                projectId: projectId,
                sceneIndex: i,
                name: "Scene ".concat(i + 1),
                description: "Description for scene ".concat(i + 1),
            });
        });
        var characters = [
            (0, exports.createTestCharacter)({ projectId: projectId, name: "Protagonist", age: "30s" }),
            (0, exports.createTestCharacter)({ projectId: projectId, name: "Antagonist", age: "40s" }),
            (0, exports.createTestCharacter)({ projectId: projectId, name: "Sidekick", age: "20s" }),
        ];
        var locations = [
            (0, exports.createTestLocation)({ projectId: projectId, name: "City Street", type: "urban" }),
            (0, exports.createTestLocation)({ projectId: projectId, name: "Coffee Shop", type: "interior" }),
        ];
        return (0, exports.createTestProject)({
            id: projectId,
            metadata: (0, exports.createTestProjectMetadata)({
                title: "Rich Storyboard Test",
                initialPrompt: "A cinematic story about urban life",
            }),
            scenes: scenes,
            characters: characters,
            locations: locations,
        });
    },
    audioProject: function () { return (0, exports.createTestProject)({
        metadata: (0, exports.createTestProjectMetadata)({
            hasAudio: true,
            audioGcsUri: "gs://test-bucket/audio/test.mp3",
            audioPublicUri: "https://storage.example.com/audio/test.mp3",
            duration: 180,
            tempo: 120,
            keySignature: "C major",
        }),
        audioAnalysis: {
            audioGcsUri: "gs://test-bucket/audio/test.mp3",
            audioPublicUri: "https://storage.example.com/audio/test.mp3",
            duration: 180,
            bpm: 120,
            keySignature: "C major",
            segments: [
                { startTime: 0, endTime: 30, duration: 30, type: "lyrical", lyrics: "", musicalDescription: "Intro", musicChange: "None", intensity: "low", mood: "calm", tempo: "moderate", audioEvidence: "Soft intro", transientImpact: "soft", transitionType: "none" },
                { startTime: 30, endTime: 90, duration: 60, type: "lyrical", lyrics: "", musicalDescription: "Build up", musicChange: "Tempo increase", intensity: "medium", mood: "tense", tempo: "moderate", audioEvidence: "Drums enter", transientImpact: "sharp", transitionType: "none" },
                { startTime: 90, endTime: 180, duration: 90, type: "climax", lyrics: "", musicalDescription: "Climax section", musicChange: "Full instrumentation", intensity: "high", mood: "intense", tempo: "fast", audioEvidence: "All instruments", transientImpact: "explosive", transitionType: "none" },
            ],
        },
    }); },
    workflowChain: function (projectId) { return __awaiter(void 0, void 0, void 0, function () {
        var pid, timestamp;
        return __generator(this, function (_a) {
            pid = projectId !== null && projectId !== void 0 ? projectId : (0, uuid_1.v7)();
            timestamp = Date.now();
            return [2 /*return*/, Promise.all([
                    (0, exports.createTestJob)("EXPAND_CREATIVE_PROMPT", {
                        projectId: pid,
                        uniqueKey: "expand-".concat(timestamp),
                    }),
                    (0, exports.createTestJob)("GENERATE_STORYBOARD", {
                        projectId: pid,
                        uniqueKey: "storyboard-".concat(timestamp),
                        state: "PENDING",
                    }),
                    (0, exports.createTestJob)("PROCESS_AUDIO_TO_SCENES", {
                        projectId: pid,
                        uniqueKey: "storyboard-".concat(timestamp),
                        state: "PENDING",
                    }),
                    (0, exports.createTestJob)("ENHANCE_STORYBOARD", {
                        projectId: pid,
                        uniqueKey: "storyboard-".concat(timestamp),
                        state: "PENDING",
                    }),
                    (0, exports.createTestJob)("SEMANTIC_ANALYSIS", {
                        projectId: pid,
                        uniqueKey: "semantic-".concat(timestamp),
                    }),
                    (0, exports.createTestJob)("GENERATE_CHARACTER_ASSETS", {
                        projectId: pid,
                        uniqueKey: "char-assets-".concat(timestamp),
                    }),
                    (0, exports.createTestJob)("GENERATE_LOCATION_ASSETS", {
                        projectId: pid,
                        uniqueKey: "loc-assets-".concat(timestamp),
                    }),
                    (0, exports.createTestJob)("GENERATE_SCENE_FRAMES", {
                        projectId: pid,
                        uniqueKey: "frames-".concat(timestamp),
                        payload: { sceneIds: [], assetKeys: ["scene_start_frame", "scene_end_frame"] },
                    }),
                    (0, exports.createTestJob)("GENERATE_SCENE_VIDEO", {
                        projectId: pid,
                        uniqueKey: "video-".concat(timestamp),
                        payload: { sceneId: (0, uuid_1.v7)(), overridePrompt: "" },
                    }),
                    (0, exports.createTestJob)("RENDER_VIDEO", {
                        projectId: pid,
                        uniqueKey: "render-".concat(timestamp),
                        payload: { videoPaths: [], audioGcsUri: null },
                    }),
                ])];
        });
    }); },
    batchStressTest: function (projectId) { return __awaiter(void 0, void 0, void 0, function () {
        var pid, timestamp;
        return __generator(this, function (_a) {
            pid = projectId !== null && projectId !== void 0 ? projectId : (0, uuid_1.v7)();
            timestamp = Date.now();
            return [2 /*return*/, Promise.all([
                    (0, exports.createTestJob)("GENERATE_CHARACTER_ASSETS", {
                        projectId: pid,
                        uniqueKey: "batch-char-".concat(timestamp),
                        payload: { characters: [] } // Empty list implies ALL characters
                    }),
                    (0, exports.createTestJob)("GENERATE_LOCATION_ASSETS", {
                        projectId: pid,
                        uniqueKey: "batch-loc-".concat(timestamp),
                        payload: { locations: [] } // Empty list implies ALL locations
                    }),
                    (0, exports.createTestJob)("GENERATE_SCENE_FRAMES", {
                        projectId: pid,
                        uniqueKey: "batch-frames-".concat(timestamp),
                        payload: {
                            sceneIds: [], // Empty list implies ALL scenes
                            assetKeys: ["scene_start_frame", "scene_end_frame"]
                        },
                    }),
                ])];
        });
    }); },
};
