import useSWR from 'swr';
import { 
  type Scene, 
  type Character, 
  type Location, 
  type WorkflowMetrics, 
  type SceneStatus, 
  type PipelineMessage,
  type Storyboard,
  type VideoMetadata
} from "@shared/pipeline-types";

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface AppData {
  storyboardState: {
    metadata: VideoMetadata;
    scenes: Scene[];
    characters: Character[];
    locations: Location[];
  };
  metrics: WorkflowMetrics;
  sceneStatuses: Record<number, SceneStatus>;
  messages: PipelineMessage[];
  projects: string[];
}

export function useAppData(projectId: string) {
  const { data, error, isLoading } = useSWR<AppData>(`/api/state?project=${projectId}`, fetcher);
  const { data: projectData, error: projectError, isLoading: projectIsLoading } = useSWR<{ projects: string[] }>("/api/projects", fetcher);

  return {
    data: data ? { ...data, projects: projectData?.projects || [] } : undefined,
    isLoading: isLoading || projectIsLoading,
    isError: error || projectError
  };
}