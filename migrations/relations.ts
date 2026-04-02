import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
	assetEntries: {
		character: r.one.characters({
			from: r.assetEntries.characterId,
			to: r.characters.id
		}),
		file: r.one.files({
			from: r.assetEntries.fileId,
			to: r.files.id
		}),
		location: r.one.locations({
			from: r.assetEntries.locationId,
			to: r.locations.id
		}),
		project: r.one.projects({
			from: r.assetEntries.projectId,
			to: r.projects.id
		}),
		scene: r.one.scenes({
			from: r.assetEntries.sceneId,
			to: r.scenes.id
		}),
		mediaObjects: r.many.mediaObjects({
			from: r.assetEntries.id.through(r.assetVersions.assetEntryId),
			to: r.mediaObjects.data.through(r.assetVersions.mediaId)
		}),
	},
	characters: {
		assetEntries: r.many.assetEntries(),
		project: r.one.projects({
			from: r.characters.projectId,
			to: r.projects.id
		}),
		scenes: r.many.scenes({
			from: r.characters.id.through(r.scenesToCharacters.characterId),
			to: r.scenes.id.through(r.scenesToCharacters.sceneId)
		}),
		tagRegistries: r.many.tagRegistry(),
	},
	files: {
		assetEntries: r.many.assetEntries(),
	},
	locations: {
		assetEntries: r.many.assetEntries(),
		project: r.one.projects({
			from: r.locations.projectId,
			to: r.projects.id,
			alias: "locations_projectId_projects_id"
		}),
		projects: r.many.projects({
			from: r.locations.id.through(r.scenes.locationId),
			to: r.projects.id.through(r.scenes.projectId),
			alias: "locations_id_projects_id_via_scenes"
		}),
		tagRegistries: r.many.tagRegistry(),
	},
	projects: {
		assetEntries: r.many.assetEntries(),
		characters: r.many.characters(),
		entityVersionPins: r.many.entityVersionPins(),
		mediaObjects: r.many.mediaObjects(),
		jobs: r.many.jobs(),
		locationsProjectId: r.many.locations({
			alias: "locations_projectId_projects_id"
		}),
		worlds: r.many.worlds({
			from: r.projects.id.through(r.props.projectId),
			to: r.worlds.id.through(r.props.worldId)
		}),
		locationsViaScenes: r.many.locations({
			alias: "locations_id_projects_id_via_scenes"
		}),
		tagRegistries: r.many.tagRegistry(),
		teams: r.many.teams({
			from: r.projects.id.through(r.teamsToProjects.projectId),
			to: r.teams.id.through(r.teamsToProjects.teamId)
		}),
		users: r.many.users({
			from: r.projects.id.through(r.usersToProjects.projectId),
			to: r.users.id.through(r.usersToProjects.userId)
		}),
	},
	scenes: {
		assetEntries: r.many.assetEntries(),
		characters: r.many.characters(),
	},
	mediaObjects: {
		assetEntries: r.many.assetEntries(),
		projects: r.many.projects({
			from: r.mediaObjects.data.through(r.files.mediaId),
			to: r.projects.id.through(r.files.projectId)
		}),
	},
	entityVersionPins: {
		project: r.one.projects({
			from: r.entityVersionPins.projectId,
			to: r.projects.id
		}),
	},
	jobs: {
		project: r.one.projects({
			from: r.jobs.projectId,
			to: r.projects.id
		}),
	},
	teams: {
		worldsViaProjects: r.many.worlds({
			from: r.teams.id.through(r.projects.teamId),
			to: r.worlds.id.through(r.projects.worldId),
			alias: "teams_id_worlds_id_via_projects"
		}),
		projects: r.many.projects(),
		worldsViaTeamsToWorlds: r.many.worlds({
			from: r.teams.id.through(r.teamsToWorlds.teamId),
			to: r.worlds.id.through(r.teamsToWorlds.worldId),
			alias: "teams_id_worlds_id_via_teamsToWorlds"
		}),
		users: r.many.users({
			from: r.teams.id.through(r.usersToTeams.teamId),
			to: r.users.id.through(r.usersToTeams.userId)
		}),
		worldsTeamId: r.many.worlds({
			alias: "worlds_teamId_teams_id"
		}),
	},
	worlds: {
		teamsViaProjects: r.many.teams({
			alias: "teams_id_worlds_id_via_projects"
		}),
		projects: r.many.projects(),
		tagRegistries: r.many.tagRegistry(),
		teamsViaTeamsToWorlds: r.many.teams({
			alias: "teams_id_worlds_id_via_teamsToWorlds"
		}),
		users: r.many.users(),
		worldAccessGrants: r.many.worldAccessGrants(),
		team: r.one.teams({
			from: r.worlds.teamId,
			to: r.teams.id,
			alias: "worlds_teamId_teams_id"
		}),
	},
	tagRegistry: {
		character: r.one.characters({
			from: r.tagRegistry.characterId,
			to: r.characters.id
		}),
		location: r.one.locations({
			from: r.tagRegistry.locationId,
			to: r.locations.id
		}),
		project: r.one.projects({
			from: r.tagRegistry.projectId,
			to: r.projects.id
		}),
		prop: r.one.props({
			from: r.tagRegistry.propId,
			to: r.props.id
		}),
		world: r.one.worlds({
			from: r.tagRegistry.worldId,
			to: r.worlds.id
		}),
	},
	props: {
		tagRegistries: r.many.tagRegistry(),
	},
	users: {
		projects: r.many.projects(),
		teams: r.many.teams(),
		worlds: r.many.worlds({
			from: r.users.id.through(r.usersToWorlds.userId),
			to: r.worlds.id.through(r.usersToWorlds.worldId)
		}),
	},
	worldAccessGrants: {
		world: r.one.worlds({
			from: r.worldAccessGrants.worldId,
			to: r.worlds.id
		}),
	},
}))