# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication Language

**IMPORTANT: Always respond in Japanese (日本語) when working in this repository.** All explanations, error messages, and communication should be in Japanese to match the project's primary language and documentation.

## Command Execution Policy (Windows Command Prompt)

**Hard requirement:** All commands in this repository are intended for **Windows Command Prompt (`cmd.exe`)** — **not** Bash and **not** PowerShell.
When Claude Code proposes or executes commands, it **must** use Command Prompt syntax.

* Terminal target: **Command Prompt (cmd.exe)**
* Use code fences with language tag **`bat** (or **`batch**)
* Path separator: `\`
* Environment variable reference: `%VAR_NAME%`
* Line continuation: `^`
* Command chaining: `&&`


## Project Overview

This is **vscode-locore**, a VS Code extension for inline code review management. The extension provides a local, Git-integrated code review workflow that persists review artifacts within the repository.

## Core Architecture

This is an early-stage project with detailed specifications but no implementation yet. The project structure is minimal, containing only documentation files.

### Key Components (Planned)

Based on the requirements specification, the extension will be built using:

- **VS Code Comments API**: For inline threaded discussions and multi-line Markdown input
- **TreeView API**: Review Explorer sidebar for browsing reviews by status and file  
- **WebviewView**: Detailed review pane for viewing, replying, and status updates
- **CodeLens API**: Display review counts and status indicators above code lines
- **Inlay Hints API**: Show status badges inline within code lines
- **Text Editor Decorations**: Gutter and scrollbar indicators with hover links
- **WorkspaceEdit**: Optional code suggestion application

### Data Model

Reviews will be stored as individual files in `.codereview/` directory:
- **Thread-per-file**: Each review thread saved as human-readable text with Markdown content
- **Anchoring System**: Context-based re-anchoring when code changes, with fallback to manual re-positioning
- **State Management**: Open/Resolved states with optional Fixed/NeedsResponse flags

## Development Status

**This is a planning-stage project** - implementation has not yet begun. The codebase currently contains only:
- `README.md`: Brief project description
- `requirements.md`: Detailed Japanese specification document outlining features and technical approach

## Key Features (Planned)

- **Local-first**: All review data persists in repository, no external services
- **Git Integration**: Review files can be committed and shared via Git
- **Re-anchoring**: Automatic repositioning of review comments when code changes
- **Multi-modal UI**: CodeLens, decorations, sidebar tree, and detail panes
- **Thread Management**: Nested replies with status tracking and filtering

## Next Steps for Development

When beginning implementation, consider:
1. Setting up VS Code extension scaffolding (`yo code`)
2. Implementing core data structures for review threads
3. Building the Comments API integration first for basic functionality
4. Adding file persistence layer for `.codereview/` storage
5. Implementing the TreeView for review management

The requirements document provides comprehensive technical specifications in Japanese that should guide the implementation approach.