AssetVersionManager is the single class responsible for asset creation to linked entities:

Asset system using a dual-table structure:
AssetEntries is a thin record with head and best version numbers with no data.
AssetVersions is the data record with version number.
Review schema in src/shared/db/schema.ts for table structure.

Critical: Assets are dependent to entities and can't be created before the linked entity is created.
                