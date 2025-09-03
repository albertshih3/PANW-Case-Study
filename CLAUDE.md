# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered journaling companion application built for a hackathon case study. The project implements a conversational journaling experience where users chat with an AI that provides empathetic, context-aware responses and analyzes patterns over time.

### Problem Being Solved
Many people struggle to maintain consistent journaling practices due to "blank page" anxiety, lack of guidance, and difficulty identifying meaningful patterns in their entries. This application addresses these challenges by creating a private, intelligent companion that makes self-reflection seamless and insightful.

### Solution Approach
The application uses a chat-based interface where users engage in dynamic conversations with an AI, eliminating traditional journaling barriers. The AI adapts to user context and history, providing personalized follow-up questions and insights through NLP and sentiment analysis.

## Development Commands

- **Development server**: `npm run dev` - Starts Vite dev server with HMR
- **Build**: `npm run build` - Compiles TypeScript and builds for production using `tsc -b && vite build`
- **Lint**: `npm run lint` - Runs ESLint on the codebase
- **Preview**: `npm run preview` - Preview production build locally

## Architecture

### Tech Stack
- **Framework**: React 19.1.1 with TypeScript
- **Build Tool**: Vite 7.1.2 with SWC plugin for fast refresh
- **Linting**: ESLint 9.33.0 with TypeScript ESLint integration
- **Module System**: ES Modules (`"type": "module"`)
- **Claude 4 Sonnet** → conversation  
- **Vector DB (Pinecone or pgvector)** → memory retrieval  
- **Guardrails AI / Llama Guard** → moderation  
- **FastAPI backend** → orchestrating AI calls + insights pipeline  
- **LANGCHAIN** -> used to manage all backend ai services

### Project Structure
- `src/main.tsx` - Application entry point with React StrictMode
- `src/App.tsx` - Main application component
- `src/assets/` - Static assets like SVG files
- `public/` - Public static files
- TypeScript configuration split into `tsconfig.app.json` (for src/) and `tsconfig.node.json` (for build tools)

### TypeScript Configuration
- Strict mode enabled with additional linting rules
- Uses `bundler` module resolution for Vite compatibility
- JSX configured for React 17+ automatic runtime
- No emit mode (Vite handles transpilation)

## Key Features to Implement

### Core Functionality
- **Chat-Based Interface**: Conversational journaling that feels like texting a trusted friend
- **Adaptive AI Responses**: Context-aware follow-up questions based on user history and emotional patterns
- **Dynamic Prompts**: Thoughtful questions that evolve based on previous entries and stated goals

### Data Analysis & Insights
- **Sentiment Analysis**: Track emotional trends over time using NLP
- **Theme Detection**: Identify recurring topics (work stress, relationships, creativity, etc.)
- **Pattern Recognition**: Surface connections between activities and emotional states
- **Reflection Summaries**: Generate periodic insights highlighting meaningful patterns

### Privacy & Security
- On-device analysis where possible to ensure data privacy
- Secure, non-judgmental interface design
- Private sentiment and theme analysis

## Target Users
- Mental wellness seekers interested in self-reflection
- Journaling beginners intimidated by traditional approaches
- Busy professionals needing quick, effective stress processing tools

## Success Metrics
- User engagement and consistency of daily journaling
- Depth of reflection achieved through AI conversations
- Trust and privacy perception
- Effectiveness of AI-generated insights in pattern discovery

## Git Workflow

- **Main branch**: `main` 
- **Current branch**: `development`
- Repository: https://github.com/albertshih3/PANW-Case-Study.git