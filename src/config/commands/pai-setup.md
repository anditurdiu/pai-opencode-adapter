---
description: Interactive PAI setup wizard — configure your identity, preferences, voice settings, and provider mappings for the PAI-OpenCode adapter.
agent: algorithm
---

Run the PAI onboarding setup for this user. This is a first-time setup wizard. Follow these steps:

## Step 1: Welcome & Identity

Welcome the user to PAI on OpenCode. Ask them:
1. What name they'd like PAI to call them
2. What they'd like to name their AI assistant (default: "PAI")
3. Their timezone (try to detect from system, confirm with user)

## Step 2: Voice Preferences

Check if `~/.config/opencode/pai-adapter.json` exists and read voice settings.
Ask if they want to enable/disable voice notifications.
If enabling, check for ElevenLabs API key.

## Step 3: Work Style

Ask about their preferred work style:
- Do they prefer the Algorithm (structured 7-phase) approach for most tasks, or Native (direct) mode?
- What effort level do they typically want? (Standard for quick tasks, Extended for quality work)

## Step 4: Write Configuration

Based on their answers:
1. Update `~/.config/opencode/pai-adapter.json` with their preferences
2. If TELOS files don't exist at `~/.claude/PAI/USER/TELOS/`, create basic ones with their identity info
3. Confirm the setup is complete

## Step 5: Verify

Show them a summary of what was configured and suggest they try:
- Tab key to switch between Algorithm and Native agents
- `/algorithm` to start a structured task
- `/telos` to review their goals

$ARGUMENTS
