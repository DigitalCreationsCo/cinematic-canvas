import * as schema from "./schema.js";
import { defineRelations } from "drizzle-orm";

export const relations = defineRelations(schema, (r) => ({
  scenes: {
    characters: r.many.characters({
      from: r.scenes.id.through(r.scenesToCharacters.sceneId),
      to: r.characters.id.through(r.scenesToCharacters.characterId),
    }),
    location: r.one.locations({
      from: r.scenes.locationId,
      to: r.locations.id,
    }),
  },
  characters: {
    scenes: r.many.scenes(),
  },
  locations: {
    scenes: r.many.scenes(),
  },
  teams: {
    members: r.many.users({
      from: r.teams.id.through(r.usersToTeams.teamId),
      to: r.users.id.through(r.usersToTeams.userId),
    }),
    worlds: r.many.worlds({
      from: r.teams.id.through(r.teamsToWorlds.teamId),
      to: r.worlds.id.through(r.teamsToWorlds.worldId),
    }),
    projects: r.many.projects({
      from: r.teams.id.through(r.teamsToProjects.teamId),
      to: r.projects.id.through(r.teamsToProjects.projectId),
    }),
  },
  users: {
    teams: r.many.teams({
      from: r.users.id.through(r.usersToTeams.userId),
      to: r.teams.id.through(r.usersToTeams.teamId),
    }),
    worlds: r.many.worlds({
      from: r.users.id.through(r.usersToWorlds.userId),
      to: r.worlds.id.through(r.usersToWorlds.worldId),
    }),
    projects: r.many.projects({
      from: r.users.id.through(r.usersToProjects.userId),
      to: r.projects.id.through(r.usersToProjects.projectId),
    }),
  },
  worlds: {
    users: r.many.users(),
    teams: r.many.teams(),
    projects: r.many.projects(),
  },
  projects: {
    users: r.many.users(),
    teams: r.many.teams(),
    worlds: r.one.worlds({
      from: r.projects.worldId.through(r.teamsToWorlds.worldId),
      to: r.worlds.id.through(r.teamsToWorlds.worldId),
    }),
  },
  files: {
    project: r.one.projects({
      from: r.files.projectId,
      to: r.projects.id,
    }),
    assetEntries: r.many.assetEntries(),
  },
  assetEntries: {
    project: r.one.projects({
      from: r.assetEntries.projectId,
      to: r.projects.id,
    }),
    scene: r.one.scenes({
      from: r.assetEntries.sceneId,
      to: r.scenes.id,
    }),
    character: r.one.characters({
      from: r.assetEntries.characterId,
      to: r.characters.id,
    }),
    location: r.one.locations({
      from: r.assetEntries.locationId,
      to: r.locations.id,
    }),
    file: r.one.files({
      from: r.assetEntries.fileId,
      to: r.files.id,
    }),
    versions: r.many.assetVersions(),
  },
  assetVersions: {
    assetEntry: r.one.assetEntries({
      from: r.assetVersions.assetEntryId,
      to: r.assetEntries.id,
    }),
    mediaObject: r.one.mediaObjects({
      from: r.assetVersions.data,
      to: r.mediaObjects.data,
    }),
  },
  mediaObjects: {
    assetVersions: r.many.assetVersions(),
  },
  conversations: {
    project: r.one.projects({
      from: r.conversations.projectId,
      to: r.projects.id,
    }),
    user: r.one.users({
      from: r.conversations.userId,
      to: r.users.id,
    }),
    messages: r.many.messages(),
  },
  messages: {
    conversation: r.one.conversations({
      from: r.messages.conversationId,
      to: r.conversations.id,
    }),
    user: r.one.users({
      from: r.messages.userId,
      to: r.users.id,
    }),
  },
}));
