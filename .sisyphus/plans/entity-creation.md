# Implementation Plan: Entity Creation from Image Import

## Overview

This plan details how to add proper entity creation (character, location) to the Supabase database when images are imported via:
1. **Direct drop onto canvas** (`useImageFileDrop.ts`)
2. **Bulk staging panel** (`BulkFilesStagingPanel.tsx`)

The goal is to make imported entities available to `CompositionalAgent` for storyboard generation.

---

## Current Architecture Analysis

### How Entity Creation Works (Reference: NewEntityModal.tsx)

The existing `NewEntityModal.tsx` demonstrates the correct pattern:

```
1. Upload image to GCS via apiFetchMultipart(api.assets.uploadImage())
2. Create entity in DB via apiFetch(api.entities.list(), { method: 'POST', body: { inserts: [...] } })
3. Add to client store via useProjectStore.addCharacter/addLocation/addScene()
4. Create canvas node via NodeFactory.createNode() + useNodeStore.addNode()
5. Attach asset via apiFetch(api.assets.list(), { method: 'POST', body: {...} })
6. Fetch and merge assets into useAssetStore
```

### How SSE Events Work (Reference: usePipelineEvents.ts)

The `ENTITY_CREATED` event handler (lines 260-282) automatically:
- Adds entity to project store via `addCharacter()`, `addLocation()`, `addScene()`
- Creates canvas node via `NodeFactory.createNode()` + `useNodeStore.getState().addNode()`

### Node Replacement Flow (CRITICAL)

This is the key behavior after user clarification:

1. **Initial state**: Image dropped on canvas → Placeholder IMAGE node created
2. **Entity conversion**: User specifies "this is a character/location" → Upload + create entity
3. **ENTITY_CREATED**: Backend publishes event with entity data
4. **Auto node creation**: `usePipelineEvents.ts` handler creates CHARACTER/LOCATION node
5. **Node replacement**: OLD placeholder IMAGE node must be REMOVED

**Implementation note**: Need to track which placeholder node was created for the dropped image, so it can be removed when the entity node replaces it.

---

## Files to Modify

### 1. API Layer - No Changes Required

The existing API functions are sufficient:
- `apiFetch()` - generic HTTP client (already exists)
- `apiFetchMultipart()` - file uploads (already exists)
- `api.assets.uploadImage()` - image upload endpoint (already exists)
- `api.entities.list()` - entity insertion endpoint (already exists)

### 2. useImageFileDrop.ts - MAJOR CHANGES

**Current Behavior (Lines 40-102)**:
- Creates `image` type nodes only
- Stores image data in `useAssetStore`
- Does NOT create character/location entities

**Required Changes**:

#### 2.1 Add entity type parameter to handleImageFile

```typescript
// NEW: Add entityType parameter to handleImageFile
const handleImageFile = async (
  file: File,
  dropPosition: { x: number; y: number },
  projectId: string,
  entityType?: 'character' | 'location' | 'image'  // NEW PARAMETER
): Promise<void> => {
```

#### 2.2 Conditional entity creation logic

When `entityType` is 'character' or 'location':
1. Upload image to GCS via `apiFetchMultipart(api.assets.uploadImage(), formData)`
2. Create entity in DB via `apiFetch(api.entities.list(), { method: 'POST', body: { inserts: [...] } })`
3. Add to project store via `useProjectStore.getState().addCharacter()` / `addLocation()`
4. Create entity-typed canvas node (NOT 'image' type)
5. Attach uploaded image as asset

#### 2.3 Return created entity ID

```typescript
// MODIFIED: Return entity info for node creation
interface HandleImageFileResult {
  nodeId: string;
  entityId?: string;  // NEW: only populated for character/location
  entityType?: 'character' | 'location' | 'image';
}
```

#### 2.4 Update handleFileDrop to support entity types

The hook needs to know what entity type the dropped images should become. Options:
- **Option A**: Add parameter to `handleFileDrop` 
- **Option B**: Add new exported function `handleEntityFileDrop(entityType)` 
- **Option C**: Check file metadata or naming convention

**RECOMMENDATION**: Option B - create separate exported function:
```typescript
export function useImageFileDrop(externalRef?: React.RefObject<HTMLDivElement | null>) {
  // ... existing code ...
  
  // NEW FUNCTION
  const handleEntityFileDrop = useCallback(async (
    event: DragEvent,
    projectId: string,
    entityType: 'character' | 'location'
  ): Promise<boolean> => {
    // Similar to handleFileDrop but calls handleImageFile with entityType
  }, [...]);
  
  return {
    setWrapperRef: ...,
    handleFileDrop,  // For generic image drops (image nodes)
    handleEntityFileDrop,  // NEW: For entity drops (character/location nodes)
    handleImageFile,  // Expose for custom workflows
    isSupportedExtension,
    SUPPORTED_EXTENSIONS,
  };
}
```

---

### 3. BulkFilesStagingPanel.tsx - MAJOR CHANGES

**Current Behavior (Lines 377-385)**:
```typescript
const handlePlaceAll = useCallback(() => {
    const toPlace = readyImages.map((img) => ({
        file: img.file,
        previewUrl: img.previewUrl,
        useType: img.useType as ImageUseType,
        name: img.name.trim() || img.file.name.replace(/\.[^.]+$/, ''),
    }));
    onPlace(toPlace);  // Only passes to callback - NO ENTITY CREATION
}, [readyImages, onPlace]);
```

**Required Changes**:

#### 3.1 Import required dependencies

```typescript
import { apiFetch, apiFetchMultipart } from '../../../lib/api.js';
import { api } from '../../../lib/routes.js';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useAssetStore } from '../../../store/useAssetStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { NodeFactory } from '../../../domain/canvas/NodeFactory.js';
import { generateId } from "#shared/utils/id.js";
```

#### 3.2 Modify onPlace callback to create entities

The component receives `projectId` but ignores it. Need to use it:

```typescript
// MODIFIED: Full onPlace handler within BulkFilesStagingPanel
export function BulkFilesStagingPanel({
    files,
    projectId,  // USE THIS - currently prefixed with underscore: _projectId
    onPlace,
    onClose,
}: BulkFilesStagingPanelProps) {
    // ... existing state ...
    
    // MODIFIED: Full handlePlaceAll with entity creation
    const handlePlaceAll = useCallback(async () => {
        const toPlace = readyImages.map((img) => ({
            file: img.file,
            previewUrl: img.previewUrl,
            useType: img.useType as ImageUseType,
            name: img.name.trim() || img.file.name.replace(/\.[^.]+$/, ''),
        }));
        
        // Process each image - create entity if character/location
        for (const img of toPlace) {
            if (img.useType === 'character' || img.useType === 'location') {
                // 1. Upload image to GCS
                const formData = new FormData();
                formData.append("image", img.file);
                formData.append("projectId", projectId);
                const uploadData = await apiFetchMultipart(api.assets.uploadImage(), formData);
                
                // 2. Prepare entity data
                const entityData = {
                    name: img.name,
                    referenceId: img.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    ...(img.useType === 'character' ? {
                        aliases: [],
                        physicalTraits: {},
                        state: {}
                    } : {
                        timeOfDay: 'day',
                        weather: 'clear'
                    })
                };
                
                // 3. Create entity in DB
                const { entities } = await apiFetch(api.entities.list(), {
                    method: 'POST',
                    body: JSON.stringify({
                        projectId,
                        inserts: [{
                            entityType: img.useType,
                            data: entityData
                        }]
                    })
                });
                
                const newEntity = entities[0];
                
                // 4. Add to client store
                const projectStore = useProjectStore.getState();
                if (img.useType === 'character') {
                    projectStore.addCharacter(newEntity);
                } else if (img.useType === 'location') {
                    projectStore.addLocation(newEntity);
                }
                
                // 5. Create canvas node
                const canvasNode = NodeFactory.createNode({
                    type: img.useType,  // 'character' or 'location', NOT 'image'
                    entityId: newEntity.id,
                    contextId: projectId,
                    contextType: 'project',
                    posCanvas: calculateAutoLayoutPosition(nodes, img.useType),
                    scope: 'project',
                });
                useNodeStore.getState().addNode(canvasNode);
                
                // 6. Attach asset
                await apiFetch(api.assets.list(), {
                    method: 'POST',
                    body: JSON.stringify({
                        projectId,
                        entityId: newEntity.id,
                        entityType: img.useType,
                        assetKey: img.useType === 'character' ? 'character_image' : 'location_image',
                        url: uploadData.imagePublicUri
                    })
                });
                
                // 7. Fetch and merge assets
                const assetStore = useAssetStore.getState();
                const entityAssets = img.useType === 'character'
                    ? await getCharacterAssets(projectId, newEntity.id)
                    : await getLocationAssets(projectId, newEntity.id);
                assetStore.setAssets(newEntity.id, entityAssets);
                
            } else if (img.useType === 'image' || img.useType === 'prop') {
                // Fall back to original onPlace behavior for generic types
                // This delegates to parent's onPlace handler
            }
        }
        
        // Call original onPlace for any non-entity types
        const nonEntityImages = toPlace.filter(img => 
            img.useType === 'image' || img.useType === 'prop'
        );
        if (nonEntityImages.length > 0) {
            onPlace(nonEntityImages);
        }
        
        setStagedFiles([]); // Clear tray
    }, [readyImages, projectId, onPlace]);
```

#### 3.3 Add missing imports

Need to add:
```typescript
import { getCharacterAssets, getLocationAssets } from '../../../lib/api.js';
```

#### 3.4 Fix projectId parameter usage

Line 285 currently:
```typescript
projectId: _projectId,  // Prefixed with underscore - NOT USED
```

Should be:
```typescript
projectId,  // Remove underscore prefix
```

#### 3.5 Add getCharacterAssets/getLocationAssets imports

```typescript
import { getCharacterAssets, getLocationAssets } from '../../../lib/api.js';
```

---

### 4. ProjectBuilderCanvas.tsx - MINOR CHANGES

**Current Usage of BulkFilesStagingPanel (Lines 521-541)**:

```typescript
<BulkFilesStagingPanel
    files={stagedFiles}
    projectId={projectId}
    onClose={() => setStagedFiles([])}
    onPlace={(placedImages) => {
        // Current: Only creates nodes, no entity creation
        placedImages.forEach((img) => {
            addNode(
                NodeFactory.createNode({
                    type: img.useType,
                    entityId: img.name,
                    // ...
                })
            );
        });
        setStagedFiles([]);
    }}
/>
```

**Required Changes**:

Since `BulkFilesStagingPanel` will now handle entity creation internally, the `onPlace` callback can be simplified or removed entirely. However, for backward compatibility and to handle the 'image'/'prop' types that don't create entities:

```typescript
// MODIFIED: Simplify onPlace - BulkFilesStagingPanel handles entity creation
onPlace={(placedImages) => {
    // Only handle non-entity types here (image, prop)
    const nonEntityImages = placedImages.filter(img => 
        img.useType === 'image' || img.useType === 'prop'
    );
    
    nonEntityImages.forEach((img) => {
        addNode(
            NodeFactory.createNode({
                type: img.useType,
                entityId: img.name,
                contextId: projectId,
                contextType: 'project',
                posCanvas: calculateAutoLayoutPosition(nodes, img.useType),
                scope: 'project',
            })
        );
    });
    
    setStagedFiles([]);
}}
```

---

### 5. useImageFileDrop.ts Integration with ProjectBuilderCanvas

**Current Drop Handler (Lines 138-139)**:
```typescript
const { handleFileDrop: handleImageDrop, isSupportedExtension: isImageExtension } = useImageFileDrop(reactFlowWrapperRef);
```

**Required Changes**:

For direct canvas drops, we need to add a new handler for entity drops. Options:
1. **Add new hook function** - `handleEntityDrop(entityType)`
2. **Modify existing hook** - Add optional `entityType` parameter

**RECOMMENDATION**: Add new function to hook (as planned in section 2.4):

```typescript
// In useImageFileDrop.ts - NEW
const handleEntityDrop = useCallback(async (
    event: DragEvent,
    projectId: string,
    entityType: 'character' | 'location'
): Promise<boolean> => {
    // Similar logic to handleFileDrop but:
    // 1. Call handleImageFile with entityType parameter
    // 2. After image processing, create entity in DB
    // 3. Update node to use entity ID instead of image ID
}, [...]);
```

---

## Implementation Sequence

### Phase 1: API Verification (No Code Changes)

1. Verify `api.entities.list()` endpoint accepts `character` and `location` entity types
2. Verify `api.assets.uploadImage()` works for bulk uploads
3. Verify response format matches expectations

### Phase 2: useImageFileDrop.ts Changes

1. Add `entityType` parameter to `handleImageFile`
2. Add conditional entity creation logic
3. Add `handleEntityDrop` exported function
4. Test with single character drop

### Phase 3: BulkFilesStagingPanel.tsx Changes

1. Add required imports
2. Fix `projectId` parameter (remove underscore prefix)
3. Implement full entity creation in `handlePlaceAll`
4. Test character/location bulk import

### Phase 4: ProjectBuilderCanvas.tsx Integration

1. Update `onPlace` callback to handle simplified flow
2. Add drag handlers for entity drops if needed
3. Test full workflow

### Phase 5: Verification

1. Verify characters appear in `CompositionalAgent.existingCharacters`
2. Verify locations appear in `CompositionalAgent.existingLocations`
3. Test storyboard generation with imported characters/locations
4. Verify IndexedDB persistence still works for node positions

---

## Edge Cases and Error Handling

### 1. Upload Failure

If image upload fails:
- Show error message to user
- Do NOT create canvas node
- Do NOT create entity
- Keep files in staging panel for retry

```typescript
try {
    const uploadData = await apiFetchMultipart(api.assets.uploadImage(), formData);
} catch (error) {
    console.error('[BulkFilesStagingPanel] Upload failed:', error);
    // Show error toast, don't proceed
    return; 
}
```

### 2. Entity Creation Failure

If entity creation fails:
- Delete uploaded image from GCS (if possible)
- Show error message
- Keep files in staging panel

```typescript
try {
    const { entities } = await apiFetch(api.entities.list(), {...});
} catch (error) {
    console.error('[BulkFilesStagingPanel] Entity creation failed:', error);
    // Optionally: Clean up uploaded image
    return;
}
```

### 3. Asset Attachment Failure

If asset attachment fails:
- Entity already created in DB
- Canvas node created
- Show warning but don't rollback
- Asset can be attached manually later

### 4. Duplicate Handling

If entity with same name/referenceId exists:
- API should handle deduplication (check worker-service.ts line 320-324)
- Existing entity should be updated or skipped
- Canvas node should use existing entity ID

### 5. Empty Name Handling

If user doesn't provide name:
- Use filename without extension as default name
- Generate referenceId from filename

---

## Testing Plan

### Unit Tests

1. **useImageFileDrop tests**:
   - `handleImageFile` with entityType='character' creates entity
   - `handleImageFile` with entityType='location' creates entity
   - `handleImageFile` with no entityType creates image node only
   - Error handling for upload failure
   - Error handling for entity creation failure

2. **BulkFilesStagingPanel tests**:
   - Character entity creation on place
   - Location entity creation on place
   - Multiple entity creation in batch
   - Mixed entity types (character + location + image)
   - Error handling

### Integration Tests

1. Drop character image → verify entity in DB
2. Drop location image → verify entity in DB
3. Bulk import characters → verify all in DB
4. Run pipeline → verify characters available to CompositionalAgent

### Manual Testing

1. Import character image via staging panel → character appears in project
2. Import location image via staging panel → location appears in project  
3. Drop image directly on canvas → image node created (current behavior)
4. Run pipeline with imported character → character appears in storyboard

---

## File Dependency Map

```
ProjectBuilderCanvas.tsx
    ├── usesImageFileDrop (hook)
    │   └── useImageFileDrop.ts (modify)
    └── uses BulkFilesStagingPanel (component)
        └── BulkFilesStagingPanel.tsx (modify)
            ├── uses api.ts (no changes)
            ├── uses useProjectStore.ts (existing)
            ├── uses useNodeStore.ts (existing)
            └── uses useAssetStore.ts (existing)

usePipelineEvents.ts (existing - handles ENTITY_CREATED events)
hybridNodeStorage.ts (existing - persists node positions)
```

---

## Summary of Changes by File

| File | Changes | Complexity |
|------|---------|-------------|
| `useImageFileDrop.ts` | Add entityType param, entity creation logic, new export | Medium |
| `BulkFilesStagingPanel.tsx` | Full entity creation flow, imports fix | High |
| `ProjectBuilderCanvas.tsx` | Simplify onPlace callback | Low |
| `api.ts` | No changes needed | - |
| `usePipelineEvents.ts` | No changes needed | - |

---

## Clarified Decisions (Final)

> **User confirmed on 2025-04-18:**

1. **No AI generation** - Direct drops already provide the image. User explicitly provides character image, no need to queue AI generation.

2. **Asset key for 'prop'**: `image_file` - Use this asset key for prop-type images when creating entities.

3. **Style refs do NOT create entities** - "image" type (Style Ref) stays as image nodes. Entities are for narrative-centric elements only (character, location, scene). Reference images use `fileId` as the FK.

4. **Backend deduplication**: Uses `mediaObjects.data` (GCS URI) to deduplicate stored files. New entities reference the same `mediaId` - no duplicate uploads.

5. **Node replacement flow** (CRITICAL):
   - User drops image → system creates **PLACEHOLDER IMAGE node**
   - User specifies "this is a character/location" → upload + create entity in DB
   - Backend publishes `ENTITY_CREATED` event
   - `usePipelineEvents.ts` receives event → auto-creates proper **CHARACTER node**
   - **OLD placeholder IMAGE node must be REMOVED** - replaced by the entity node

6. **useCanvasInteractionStore**: Clear any pending interaction state when entity replaces placeholder node.

---

## References

- NewEntityModal.tsx lines 198-369 - Full entity creation pattern
- usePipelineEvents.ts lines 260-282 - ENTITY_CREATED handling
- worker-service.ts lines 278-291 - CompositionalAgent entity fetching
- api.ts lines 65-107 - generateCharacterImage, generateLocationImage
