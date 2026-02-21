Revised Image generation architecture:

Uses two image interfaces:
Contents with fileData parts
& ReferenceImages

ReferenceImages have two subsets: 
ReferenceImages (application)
ReferenceImages (google/genai)

The two interfaces are used interchangably to faciliate diverse image model fallbacks (imagen, gemini).
Transform helper functions are used to extract and append metadata and satisfy api schemas.
These helper functions are found in `src/shared/lm/utils.ts` and `src/shared/lm/google/utils.ts`.

ReferenceImage Breaking Changes:
Previously, referenceImages was supplied as a list of union ReferenceImage types.
Now, the referenceImages are passed to generateImages as an object of specified referenceImage types. The purpose is to specify the intention and usage of the image by the underlying generative ai api (subject, content, mask, base image, etc.).

Note: Imagen 3 is depracated. Imagen 4 will be depracated June 2026. There is not a new expected Imagen model. 