// src/client/src/components/Header.tsx
import { useAuth } from '#/lib/auth-context.js';
import { apiFetch } from '#/lib/api.js';
import useSWR from 'swr';
import { ThemeButton } from '#/components/ThemeButton.js';
import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { AlertCircle, Check } from 'lucide-react';

const fetcher = (url: string) => apiFetch(url);

const TeamSwitcher = () => {
    const { activeTeamId, setActiveTeamId } = useAuth();
    const { data, error } = useSWR('/teams', fetcher);

    if (error) return <div>Failed to load teams</div>;
    if (!data) return <div>Loading teams...</div>;

    const { teams } = data;

    return (
        <select
            value={activeTeamId || ''}
            onChange={(e) => setActiveTeamId(e.target.value)}
            className="tracking-wide w-60 h-9 px-3 border rounded bg-background text-sm"
        >
            <option value="">Select a team</option>
            {teams.map((team: any) => (
                <option key={team.id} value={team.id}>
                    {team.name}
                </option>
            ))}
        </select>
    );
};

const SaveStatus = () => {
    const lastSaved = useCanvasUIStore((s) => s.lastSaved);
    const saveError = useCanvasUIStore((s) => s.saveError);

    if (saveError) {
        return (
            <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                <span>{saveError}</span>
            </div>
        );
    }

    if (lastSaved) {
        const now = new Date();
        const diffMs = now.getTime() - lastSaved.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        
        let timeAgo: string;
        if (diffSec < 5) {
            timeAgo = 'Just now';
        } else if (diffSec < 60) {
            timeAgo = `${diffSec}s ago`;
        } else if (diffSec < 3600) {
            timeAgo = `${Math.floor(diffSec / 60)}m ago`;
        } else {
            timeAgo = lastSaved.toLocaleTimeString();
        }
        
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-green-500" />
                <span>Last saved {timeAgo}</span>
            </div>
        );
    }

    return null;
};

const Header = () => {
    return (
        <header className="px-4 h-14 border-b flex justify-between items-center shrink-0">
            <TeamSwitcher />

            <SaveStatus />

            <div className="flex items-center gap-4">
                <ThemeButton />
            </div>
        </header>
    );
};

export default Header;
