#!/bin/bash

# Get current timestamp in format YYYY-MM-DD-HH-MM-SS
timestamp=$(date +"%Y-%m-%d-%H_%M_%S")

# Set the filename
filename="./dev_agent_logs/sessions/${timestamp}-claude-code-session.md"

# Create the markdown file
touch "$filename"

echo "Created session markdown: $filename"
