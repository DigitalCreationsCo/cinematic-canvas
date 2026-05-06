import "@testing-library/jest-dom";

// Polyfill getAnimations for happy-dom/jsdom
if (typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = function () {
    return [];
  };
}

// vi.mock("#client/lib/api.js", () => createDeepMock());

// vi.mock("lucide-react", () => ({
//   Loader2: () => <span data-testid="icon-loader">Loader2</span>,
//   ArrowLeft: () => <span data-testid="icon-arrow-left">ArrowLeft</span>,
//   ArrowRight: () => <span data-testid="icon-arrow-right">ArrowRight</span>,
//   FolderOpen: () => <span data-testid="icon-folder-open">FolderOpen</span>,
// }));

// vi.mock("lucide-react", async () => {
//   const React = await import("react");
//   const createMockIcon = (name: string) => {
//     const MockIcon = (props: any) =>
//       React.createElement("svg", { ...props, "data-testid": `icon-${name.toLowerCase()}` });
//     MockIcon.displayName = name;
//     return MockIcon;
//   };

//   return {
//     __esModule: true,
//     // All icons used in the codebase
//     AlertCircle: createMockIcon("AlertCircle"),
//     Bell: createMockIcon("Bell"),
//     BellDot: createMockIcon("BellDot"),
//     BookOpen: createMockIcon("BookOpen"),
//     BookOpenText: createMockIcon("BookOpenText"),
//     Calendar: createMockIcon("Calendar"),
//     Check: createMockIcon("Check"),
//     ChevronDown: createMockIcon("ChevronDown"),
//     ChevronRight: createMockIcon("ChevronRight"),
//     ChevronUp: createMockIcon("ChevronUp"),
//     Clapperboard: createMockIcon("Clapperboard"),
//     Clock: createMockIcon("Clock"),
//     Copy: createMockIcon("Copy"),
//     Download: createMockIcon("Download"),
//     Edit2: createMockIcon("Edit2"),
//     Film: createMockIcon("Film"),
//     FileText: createMockIcon("FileText"),
//     FolderOpen: createMockIcon("FolderOpen"),
//     GripVertical: createMockIcon("GripVertical"),
//     GitBranch: createMockIcon("GitBranch"),
//     GitPullRequest: createMockIcon("GitPullRequest"),
//     Image: createMockIcon("Image"),
//     Info: createMockIcon("Info"),
//     Layers: createMockIcon("Layers"),
//     LayoutGrid: createMockIcon("LayoutGrid"),
//     Loader2: createMockIcon("Loader2"),
//     Lock: createMockIcon("Lock"),
//     MapPin: createMockIcon("MapPin"),
//     Maximize2: createMockIcon("Maximize2"),
//     MessageCircle: createMockIcon("MessageCircle"),
//     Music: createMockIcon("Music"),
//     Music3: createMockIcon("Music3"),
//     Plus: createMockIcon("Plus"),
//     Play: createMockIcon("Play"),
//     Redo: createMockIcon("Redo"),
//     Redo2: createMockIcon("Redo2"),
//     RotateCcw: createMockIcon("RotateCcw"),
//     Save: createMockIcon("Save"),
//     ScreenShareIcon: createMockIcon("ScreenShareIcon"),
//     Send: createMockIcon("Send"),
//     Sparkles: createMockIcon("Sparkles"),
//     Square: createMockIcon("Square"),
//     TestTubeIcon: createMockIcon("TestTubeIcon"),
//     ToolCase: createMockIcon("ToolCase"),
//     Trash2: createMockIcon("Trash2"),
//     Undo: createMockIcon("Undo"),
//     Undo2: createMockIcon("Undo2"),
//     Upload: createMockIcon("Upload"),
//     User: createMockIcon("User"),
//     Wand2: createMockIcon("Wand2"),
//     X: createMockIcon("X"),
//     Eye: createMockIcon("Eye"),
//     EyeOff: createMockIcon("EyeOff"),
//     Settings: createMockIcon("Settings"),
//     FileImage: createMockIcon("FileImage"),
//     FileType: createMockIcon("FileType"),
//     Hash: createMockIcon("Hash"),
//     Minus: createMockIcon("Minus"),
//     Pause: createMockIcon("Pause"),
//     StopCircle: createMockIcon("StopCircle"),
//     SkipForward: createMockIcon("SkipForward"),
//     SkipBack: createMockIcon("SkipBack"),
//     Repeat: createMockIcon("Repeat"),
//     Shuffle: createMockIcon("Shuffle"),
//     Volume2: createMockIcon("Volume2"),
//     VolumeX: createMockIcon("VolumeX"),
//     Monitor: createMockIcon("Monitor"),
//     Smartphone: createMockIcon("Smartphone"),
//     Tablet: createMockIcon("Tablet"),
//     Folder: createMockIcon("Folder"),
//     Home: createMockIcon("Home"),
//     Users: createMockIcon("Users"),
//     Building: createMockIcon("Building"),
//     Map: createMockIcon("Map"),
//     Camera: createMockIcon("Camera"),
//     ImagePlus: createMockIcon("ImagePlus"),
//     VideoPlus: createMockIcon("VideoPlus"),
//     MusicPlus: createMockIcon("MusicPlus"),
//     FilePlus: createMockIcon("FilePlus"),
//     FileEdit: createMockIcon("FileEdit"),
//     Trash: createMockIcon("Trash"),
//     Edit: createMockIcon("Edit"),
//     SaveAll: createMockIcon("SaveAll"),
//     Mail: createMockIcon("Mail"),
//     Phone: createMockIcon("Phone"),
//     Globe: createMockIcon("Globe"),
//     Link: createMockIcon("Link"),
//     Unlink: createMockIcon("Unlink"),
//     ExternalLink: createMockIcon("ExternalLink"),
//     ArrowLeft: createMockIcon("ArrowLeft"),
//     ArrowRight: createMockIcon("ArrowRight"),
//     ArrowUp: createMockIcon("ArrowUp"),
//     ArrowDown: createMockIcon("ArrowDown"),
//     MoreHorizontal: createMockIcon("MoreHorizontal"),
//     MoreVertical: createMockIcon("MoreVertical"),
//     Menu: createMockIcon("Menu"),
//     PanelLeft: createMockIcon("PanelLeft"),
//     PanelRight: createMockIcon("PanelRight"),
//     Search: createMockIcon("Search"),
//     Filter: createMockIcon("Filter"),
//     SlidersHorizontal: createMockIcon("SlidersHorizontal"),
//     Grid: createMockIcon("Grid"),
//     Move: createMockIcon("Move"),
//     Scissors: createMockIcon("Scissors"),
//     Clipboard: createMockIcon("Clipboard"),
//   };
// });
