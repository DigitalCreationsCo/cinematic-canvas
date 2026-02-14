import { Card, CardGrid } from '#/components/markdown/card.js';
import { FileTree } from '#/components/markdown/filetree/index.js';
import { File, Folder } from '#/components/markdown/filetree/component.js';
import RoutedLink from '#/components/markdown/link.js';
import Mermaid from '#/components/markdown/mermaid.js';
import Note from '#/components/markdown/note.js';
import { Step, StepItem } from '#/components/markdown/step.js';
import Pre from '#/components/ui/pre.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs.js'

export const components = {
  a: RoutedLink,
  Card,
  CardGrid,
  FileTree,
  Folder,
  File,
  Mermaid,
  Note,
  pre: Pre,
  Step,
  StepItem,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
}
