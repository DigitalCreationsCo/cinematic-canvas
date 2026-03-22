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

const Header = () => {
    return (
        <header className="px-4 h-14 border-b flex justify-between items-center shrink-0">
            <TeamSwitcher />

            <div id="canvas-toolbar-slot" className="flex-1 flex justify-center" />

            <div className="flex items-center gap-4">
                <ThemeButton />
                {/* <Button variant="ghost" size="icon">
                    <Settings className="w-5 h-5" />
                </Button> */}
                {/* <span className="text-sm text-muted-foreground">{user?.email}</span>
                <Button variant="ghost" size="icon" onClick={() => { if (confirm('Sign out?')) signOut() }}>
                    <LogOut className="h-4 w-4" />
                </Button> */}
            </div>
        </header>
    );
};

export default Header;
