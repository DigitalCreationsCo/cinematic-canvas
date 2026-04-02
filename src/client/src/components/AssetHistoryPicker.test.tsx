/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetHistoryPicker } from './AssetHistoryPicker.js';
import { render, screen, fireEvent } from '@testing-library/react';
import useSWR from 'swr';
import { useProjectStore, selectCurrentScene } from "../store/useProjectStore.js";
import { useAssetStore } from "../store/useAssetStore.js";
import { getAllAssetVersions, isAssetEvaluated, getAssetQualityScore } from '../../../shared/utils/assets-utils.js';
import { getSceneAssets, getCharacterAssets, getLocationAssets, getProjectAssets } from '#client/lib/api.js';

// Mock dependencies
vi.mock('#client/components/ui/dialog.js', () => ({
    Dialog: ({ children, open }: any) => open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#client/components/ui/scroll-area.js', () => ({
    ScrollArea: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#client/components/ui/tooltip.js', () => ({
    Tooltip: ({ children }: any) => <div>{children}</div>,
    TooltipTrigger: ({ children }: any) => <div>{children}</div>,
    TooltipContent: ({ children }: any) => <div data-testid="tooltip-content">{children}</div>,
    TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('#client/components/ui/badge.js', () => ({
    Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}));

vi.mock('#client/components/ui/button.js', () => ({
    Button: ({ children, onClick, variant }: any) => (
        <button onClick={onClick} data-variant={variant}>
            {children}
        </button>
    ),
}));

vi.mock('#client/components/ui/skeleton.js', () => ({
    Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('lucide-react', () => ({
    Clock: () => <span data-testid="icon-clock">Clock</span>,
    Play: () => <span data-testid="icon-play">Play</span>,
    Filter: () => <span>Filter</span>,
    SortAsc: () => <span>SortAsc</span>,
    SortDesc: () => <span>SortDesc</span>,
    CheckCircle2: () => <span>Check</span>,
}));

// Mock store and api
vi.mock("../store/useProjectStore.js", () => ({
    useProjectStore: vi.fn(),
    selectCurrentScene: vi.fn(),
}));

vi.mock("../store/useAssetStore.js", () => ({
    useAssetStore: vi.fn(),
}));

vi.mock('#client/lib/api.js', () => ({
    getSceneAssets: vi.fn(),
    getCharacterAssets: vi.fn(),
    getLocationAssets: vi.fn(),
    getProjectAssets: vi.fn(),
}));

vi.mock('swr', () => ({
    default: vi.fn(),
}));

vi.mock('../../../shared/utils/assets-utils.js', () => ({
    getAllAssetVersions: vi.fn(),
    isAssetEvaluated: vi.fn(),
    getAssetQualityScore: vi.fn(),
}));

vi.mock('../../../shared/utils/utils.js', () => ({
    resolvePublicUrl: vi.fn((url) => `resolved-${url}`),
}));

vi.mock('../../../shared/utils/errors.js', () => ({
    extractErrorMessage: vi.fn((err) => (typeof err === 'string' ? err : (err as any).message || 'Unknown Error')),
}));

describe('AssetHistoryPicker', () => {
    const defaultProps = {
        entityId: 'scene-1',
        assetType: 'scene_start_frame' as const,
        projectId: 'project-1',
        isOpen: true,
        onOpenChange: vi.fn(),
        onSelect: vi.fn(),
        currentUrl: 'url-2',
    };

    const mockSetAssets = vi.fn();
    const mockIgnoreUrls = new Set<string>();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useSWR).mockReturnValue({ isLoading: false, error: null } as any);

        vi.mocked(useAssetStore).mockImplementation((selector: any) => {
            const state = {
                assets: { get: () => ({}) },
                setAssets: mockSetAssets,
            };
            return selector(state);
        });

        // @ts-ignore
        useAssetStore.getState = vi.fn().mockReturnValue({
            assets: { get: () => ({}) }
        });

        vi.mocked(useProjectStore).mockImplementation((selector: any) => {
            const state = {
                scenes: {},
                project: { scenes: [] },
                viewedScenesHistory: []
            };
            return selector(state);
        });

        vi.mocked(getAllAssetVersions).mockReturnValue([]);
        vi.mocked(isAssetEvaluated).mockReturnValue(false);
        vi.mocked(getAssetQualityScore).mockReturnValue(undefined);
        mockIgnoreUrls.clear();
    });

    it('renders loading state correctly', () => {
        vi.mocked(useSWR).mockReturnValue({ isLoading: true, error: null } as any);
        render(<AssetHistoryPicker {...defaultProps} />);
        expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    });

    it('renders error state correctly using extractErrorMessage', () => {
        const testError = { message: 'Failed to fetch' };
        vi.mocked(useSWR).mockReturnValue({ isLoading: false, error: testError } as any);
        render(<AssetHistoryPicker {...defaultProps} />);
        expect(screen.getByText('Failed to fetch')).toBeTruthy();
    });

    it('renders empty state correctly', () => {
        render(<AssetHistoryPicker {...defaultProps} />);
        expect(screen.getByText(/No versions found/)).toBeTruthy();
    });

    it('renders correct display name and switches based on assetType', () => {
        const { rerender } = render(<AssetHistoryPicker {...defaultProps} />);
        expect(screen.getByText(/Start Frame History/)).toBeTruthy();

        rerender(<AssetHistoryPicker {...defaultProps} assetType="scene_end_frame" />);
        expect(screen.getByText(/End Frame History/)).toBeTruthy();

        rerender(<AssetHistoryPicker {...defaultProps} assetType="scene_video" />);
        expect(screen.getByText(/Video History/)).toBeTruthy();

        rerender(<AssetHistoryPicker {...defaultProps} assetType="storyboard" />);
        expect(screen.getByText(/Storyboard History/i)).toBeTruthy();
    });

    it('renders assets and handles selection', () => {
        const mockAssets = [
            { version: 1, data: 'url-1', type: 'image', createdAt: '2023-01-01T10:00:00Z', metadata: { model: 'GPT-4' } },
            { version: 2, data: 'url-2', type: 'image', createdAt: '2023-01-01T11:00:00Z', metadata: {} },
        ];
        vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);

        render(<AssetHistoryPicker {...defaultProps} />);

        expect(screen.getByText('#1')).toBeTruthy();
        expect(screen.getByText('#2')).toBeTruthy();
        expect(screen.getByText('Current')).toBeTruthy();
        expect(screen.getByText('GPT-4')).toBeTruthy();

        fireEvent.click(screen.getByText('#1'));
        expect(defaultProps.onSelect).toHaveBeenCalledWith(mockAssets[0]);
        expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    });

    it('handles sorting: newest vs oldest', () => {
        const mockAssets = [
            { version: 1, data: 'url-1', type: 'image', createdAt: '2023-01-01T10:00:00Z', metadata: {} },
            { version: 2, data: 'url-2', type: 'image', createdAt: '2023-01-01T11:00:00Z', metadata: {} },
        ];
        vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);

        render(<AssetHistoryPicker {...defaultProps} />);

        // Default newest - #2 should be first
        const versionsNewest = screen.getAllByText(/#client /);
        expect(versionsNewest[0].textContent).toBe('#2');

        fireEvent.click(screen.getByText('Oldest'));
        const versionsOldest = screen.getAllByText(/#client /);
        expect(versionsOldest[0].textContent).toBe('#1');

        fireEvent.click(screen.getByText('Newest'));
        const versionsNewestAgain = screen.getAllByText(/#client /);
        expect(versionsNewestAgain[0].textContent).toBe('#2');
    });

    it('handles sorting: quality high vs low with missing scores', () => {
        const mockAssets = [
            { version: 1, data: 'url-1', type: 'image', createdAt: '2023-01-01T10:00:00Z', metadata: {} },
            { version: 2, data: 'url-2', type: 'image', createdAt: '2023-01-01T11:00:00Z', metadata: {} },
            { version: 3, data: 'url-3', type: 'image', createdAt: '2023-01-01T12:00:00Z', metadata: {} },
        ];
        vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);
        vi.mocked(getAssetQualityScore).mockImplementation((a: any) => {
            if (a.version === 1) return 0.9;
            if (a.version === 2) return 0.5;
            return undefined; // Version 3 has no score, covers ?? branch
        });

        render(<AssetHistoryPicker {...defaultProps} />);

        fireEvent.click(screen.getByText('Quality'));
        // quality-high: 1(0.9), 2(0.5), 3(-1)
        const versionsHigh = screen.getAllByText(/#client /);
        expect(versionsHigh[0].textContent).toBe('#1');
        expect(versionsHigh[1].textContent).toBe('#2');
        expect(versionsHigh[2].textContent).toBe('#3');

        fireEvent.click(screen.getByText('Quality'));
        // quality-low: 2(0.5), 1(0.9), 3(Infinity)
        const versionsLow = screen.getAllByText(/#client /);
        expect(versionsLow[0].textContent).toBe('#2');
        expect(versionsLow[1].textContent).toBe('#1');
        expect(versionsLow[2].textContent).toBe('#3');
    });

    it('handles filtering: evaluated vs unevaluated', () => {
        const mockAssets = [
            { version: 1, data: 'url-1', type: 'image', createdAt: '2023-01-01T10:00:00Z', metadata: {} },
            { version: 2, data: 'url-2', type: 'image', createdAt: '2023-01-01T11:00:00Z', metadata: {} },
        ];
        vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);
        vi.mocked(isAssetEvaluated).mockImplementation((a: any) => a.version === 1);

        render(<AssetHistoryPicker {...defaultProps} />);

        fireEvent.click(screen.getByText('Evaluated'));
        expect(screen.queryByText('#2')).toBeNull();
        expect(screen.getByText('#1')).toBeTruthy();

        fireEvent.click(screen.getByText('Unevaluated'));
        expect(screen.queryByText('#1')).toBeNull();
        expect(screen.getByText('#2')).toBeTruthy();

        fireEvent.click(screen.getByText('All'));
        expect(screen.getByText('#1')).toBeTruthy();
        expect(screen.getByText('#2')).toBeTruthy();
    });


    it('renders video assets with correct quality badge', () => {
        const mockAssets = [
            { version: 1, data: 'video.mp4', type: 'video', createdAt: '2023-01-01T10:00:00Z', metadata: { evaluation: { score: 0.8 } } },
        ];
        vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);
        vi.mocked(isAssetEvaluated).mockReturnValue(true);
        vi.mocked(getAssetQualityScore).mockReturnValue(0.8);

        render(<AssetHistoryPicker {...defaultProps} assetType="scene_video" />);
        // VideoPlayer component doesn't show the play icon by default in this view
        expect(screen.getByText('80%')).toBeTruthy();
    });

    it('syncs to global store on SWR success and triggers fetcher', () => {
        const mockData = { some: 'registry' };
        vi.mocked(useSWR).mockImplementation((key, fetcher, options: any) => {
            if (key && fetcher) {
                fetcher(key); // Covers line 187
            }
            if (options?.onSuccess) {
                options.onSuccess(mockData);
            }
            return { isLoading: false, error: null } as any;
        });

        render(<AssetHistoryPicker {...defaultProps} />);
        expect(mockSetAssets).toHaveBeenCalledWith('scene-1', mockData);
        expect(getSceneAssets).toHaveBeenCalledWith('project-1', 'scene-1');
    });

    it('calls correct API for different entity types', () => {
        const mockData = { some: 'registry' };
        vi.mocked(useSWR).mockImplementation((key, fetcher, options: any) => {
            if (key && fetcher) {
                fetcher(key);
            }
            return { isLoading: false, error: null } as any;
        });

        render(<AssetHistoryPicker {...defaultProps} entityType="scene" />);
        expect(getSceneAssets).toHaveBeenCalledWith('project-1', 'scene-1');

        render(<AssetHistoryPicker {...defaultProps} entityId="char-1" entityType="character" />);
        expect(getCharacterAssets).toHaveBeenCalledWith('project-1', 'char-1');

        render(<AssetHistoryPicker {...defaultProps} entityId="loc-1" entityType="location" />);
        expect(getLocationAssets).toHaveBeenCalledWith('project-1', 'loc-1');

        render(<AssetHistoryPicker {...defaultProps} entityId="proj-1" entityType="project" />);
        expect(getProjectAssets).toHaveBeenCalledWith('project-1');
    });

    it('shows "Show All Versions" button when filtering results in empty set', () => {
        const mockAssets = [
            { version: 1, data: 'url-1', type: 'image', createdAt: '2023-01-01T10:00:00Z', metadata: {} }
        ];
        vi.mocked(getAllAssetVersions).mockReturnValue(mockAssets as any);
        vi.mocked(isAssetEvaluated).mockReturnValue(true); // Version 1 is evaluated

        render(<AssetHistoryPicker {...defaultProps} />);

        // Switch to Unevaluated -> No versions
        fireEvent.click(screen.getByText('Unevaluated'));
        expect(screen.getByText(/No unevaluated versions found/)).toBeTruthy();

        // Click Show All -> Switch back to All
        fireEvent.click(screen.getByText('Show All Versions'));
        expect(screen.getByText('#1')).toBeTruthy();
    });

    it('handles swrKey when isOpen is false', () => {
        vi.mocked(useSWR).mockReturnValue({ isLoading: false, error: null } as any);
        render(<AssetHistoryPicker {...defaultProps} isOpen={false} />);
        expect(vi.mocked(useSWR)).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Object));
    });
});
