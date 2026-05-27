---
title: Audio & Media Features
description: Audio analysis, music synchronization, and video stitching capabilities.
keywords: ["audio", "media processing", "ffmpeg", "stitching", "music video"]
---


# Audio Functionality

Cinematic Canvas isn't just about silent video. It includes robust audio integration to create immersive **Music Videos** and scored scenes.

## Core Features

### 🎧 Audio-Driven Generation
You can upload an existing audio track (song, voiceover, or score) to drive the video generation.

*   **Rhythm Analysis**: The system analyzes the beat and tempo of your audio.
*   **Lyric Sync**: If lyrics are present, scene transitions can be synchronized with verse/chorus changes.
*   **Duration Match**: The generated video is automatically timed to match the exact duration of your audio track.

### 🎼 Workflow Integration

1.  **Input**: User provides an audio file via the Web Client or CLI.
2.  **Analysis**: The `AudioProcessingAgent` scans the file for:
    *   BPM (Beats Per Minute)
    *   Mood/Sentiment
    *   Structure (Intro, Verse, Chorus, Outro)
3.  **Blueprint**: An "Audio Blueprint" is created, mapping specific timestamps to narrative beats.
4.  **Generation**: The video generation models use this blueprint to ensure the visual energy matches the audio energy.

### Muting & playback
When previewing content in the timeline:
*   The **Master Audio Track** takes priority.
*   Individual clip audio is muted to prevent clashing.
*   All video clips synchronize their playback position to the Master Audio.
