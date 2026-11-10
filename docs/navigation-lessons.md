# Navigation lesson sequence

The installed sequence has sixteen lessons in three separate source collections: the first eight map-reading lessons, Compass foundations (9–12), and Guided field navigation (13–16). Importing a later pack appends a new verified original and preserves the preceding originals and manifest. The disposable search index stays separate.

Lessons 13–16 use familiar, permitted, supervised practice areas. Each has goals, equipment, an original worked example, a practice sequence, four answer checks, a schematic and links into the installed NWCG PDF. A helper stays with the learner. Practice maps are fictional and not to scale. No region, home location, real route or field competence is inferred.

## Source review and rights

The installed **NWCG Basic Land Navigation, May 2016, PMS 475** provides source context. Physical PDF pages 133–134 were textually and visually reviewed for the measured-course pacing method and its limitations. Pages 89–90, 112 and 135–136 support compass following, map orientation and field-sketch labels/accuracy. Physical page numbering counts the cover as page 1.

[Orienteering USA’s public training reference](https://orienteeringusa.org/resources/training/) was consulted for the meanings of handrails, collecting features, attack points and catching features. The imported lessons contain original explanations, examples and drills; no paid curriculum, course map, photograph or video is bundled. Original Dewey text and new schematics are dedicated to CC0-1.0. Referenced publications retain their notices. Neither a software test nor a completed lesson constitutes field testing or a navigation qualification.

## Optional pace tool

The optional lesson property `tool: "pace"` selects a built-in, offline form. Other tool names are rejected at import/rebuild. This property cannot name a script, URL or executable command.

Inputs are a measured course length, three positive whole pace counts, target distance and a single unit (`m` or `ft`). One pace means two natural steps, counting the same foot each time. For average count `C`, course length `L` and target distance `D`, the estimate is `D × C / L`. The form reports the average, pace length, count per 100 units and estimated target count. Its result is an estimate for comparable conditions, not a position fix or route recommendation. Changing values invalidates the displayed calculation until recalculated. Nothing is persisted.

The worked example is 64, 66 and 65 paces over 100 m: average 65, and approximately 162.5 paces over 250 m. The separate feet test uses 39, 40 and 41 paces over 100 ft: approximately 100 paces over 250 ft. Invalid counts, zero course length, negative distance and unsupported units are rejected.

## Read-only agent access

`GET /api/lessons/{collection}` exposes the same validated pack, including numbering, prerequisites, source pages and optional tool name. The existing HTTP discovery/bootstrap contract remains the entry point. The pace form runs locally in the human reader; no agent execution, location lookup or household write endpoint is added. MCP remains unimplemented, uninstalled, unregistered and untested.

The next planned curriculum stage is terrain association and recovery, following supervised repeat practice of the current sixteen lessons.

## Local terrain review

The separate local review pack covers lessons 17–20: ridges/valleys/saddles/reentrants, matching contours to ground, position estimates from known features, and controlled stopping/relocation. Each includes an original example, schematic, four answer checks and source-page links. The installed sixteen-lesson sequence remains unchanged until a separately authorized import.

Optional `practiceBoundary` text appears prominently below a lesson's summary. It must be a nonempty string of at most 2,000 characters, renders as text in an accessible note, and is returned by the existing read-only lesson API. It cannot specify commands or executable markup. The new diagrams are built-in SVGs with descriptions and captions; terrain panels stack in phone layouts. Details and limitations are in [the local review record](terrain-review.md).
