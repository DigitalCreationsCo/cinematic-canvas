---
title: Introduction
description: Welcome to Cinematic Canvas, an AI-powered cinematic video generation framework.
keywords: ["introduction", "overview", "cinematic canvas", "video generation"]
---


# Cinematic Canvas Documentation

Welcome to the technical documentation for the Cinematic Canvas platform. This documentation is organized into three main sections: **Architecture**, **Features**, and **Guides**.

## 🏗️ Architecture

Understanding the core systems that power the platform.

*   [**Core System**](architecture/core-system.md): High-level overview of the distributed pipeline.
*   [**Prompt Engineering**](architecture/prompt-engineering.md): The Role-Based Prompt Architecture (Director, Cinematographer, etc.).
*   [**Temporal State**](architecture/temporal-state.md): How the system tracks continuity (injuries, weather, time) across scenes.
*   [**Data Models**](architecture/data-models.md): Schema composition, valid types, and data structure.
*   [**State Management**](architecture/state-management.md): Repository patterns and database persistence.
*   [**Workflow Orchestration**](architecture/workflow-orchestration.md): The event-driven Pub/Sub command system.

## 🚀 Features

Specific capabilities and subsystem details.

*   [**Reliability & Quality**](features/reliability-and-quality.md): Automated quality evaluation, retries, and domain rules.
*   [**Audio & Music**](features/audio.md): Generating music videos, beat sync, and lyric timing.
*   [**Workflow Control**](features/workflow-control.md): Versioning assets and managing system retries.
*   [**LTX Video Gen**](features/ltx/architecture.md): Managed Infrastructure for high-performance video generation.

## 📖 Guides

Operational manuals and best practices.

*   [**Operations**](guides/operations.md): How to run the workers locally and in production.
*   [**Evaluation**](guides/evaluation.md): A guide to evaluating and improving video quality.

## 📊 Deployment Reports

*   [**Deployment Summary**](features/ltx/reports/deployment.md): Infrastructure setup.
*   [**Cost Analysis**](features/ltx/reports/cost-analysis.md): Pricing breakdown.
