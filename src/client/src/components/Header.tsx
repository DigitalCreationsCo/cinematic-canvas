// src/client/src/components/Header.tsx
import React from 'react';
import { useAuth } from '#/lib/auth-context.js';
import { useStore } from '#/lib/store.js';
import { apiFetch } from '#/lib/api.js';
import useSWR from 'swr';
import { Button } from './ui/button.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js';
import { LogOut } from 'lucide-react';

const fetcher = (url: string) => apiFetch(url);

const TeamSwitcher = () => {
    const { activeTeamId, setActiveTeamId } = useStore();
    const { data, error } = useSWR('/teams', fetcher);

    if (error) return <div>Failed to load teams</div>;
    if (!data) return <div>Loading teams...</div>;

    const { teams } = data;

    return (
        <Select value={activeTeamId || ''} onValueChange={setActiveTeamId}>
            <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Select a team" />
            </SelectTrigger>
            <SelectContent>
                {teams.map((team: any) => (
                    <SelectItem key={team.id} value={team.id}>
                        {team.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};

const Header = () => {
    const { signOut, user } = useAuth();

    return (
        <header className="p-4 border-b flex justify-between items-center shrink-0">
            <TeamSwitcher />
            <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{user?.email}</span>
                <Button variant="ghost" size="icon" onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                </Button>
            </div>
        </header>
    );
};

export default Header;
