import { Card, CardGrid } from '#w/components/markdown/card.js'
import { FileTree } from '#w/components/markdown/filetree/index.js'
import { File, Folder } from '#w/components/markdown/filetree/component.js'
import RoutedLink from '#w/components/markdown/link.js'
import Mermaid from '#w/components/markdown/mermaid.js'
import Note from '#w/components/markdown/note.js'
import { Step, StepItem } from '#w/components/markdown/step.js'
import Pre from '#w/components/ui/pre.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#w/components/ui/tabs.js'

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
