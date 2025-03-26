#!/bin/bash

# Exit on error
set -e

# Function to display usage information
function show_usage {
  echo "Usage: $0 [major|minor|patch|undo]"
  echo "  major: Bump major version (X.0.0)"
  echo "  minor: Bump minor version (x.X.0)"
  echo "  patch: Bump patch version (x.x.X)"
  echo "  undo:  Revert to the previous version (from last commit)"
  echo "A version action must be specified."
}

# Check if an argument was provided
if [ $# -eq 0 ]; then
  echo "Error: No version action specified."
  show_usage
  exit 1
fi

VERSION_ACTION=$1

# Find the package.json file
PACKAGE_JSON="package.json"
if [ ! -f "$PACKAGE_JSON" ]; then
  echo "Error: package.json not found."
  exit 1
fi

# Handle undo action
if [[ "$VERSION_ACTION" == "undo" ]]; then
  # Check if we're in a git repository
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not a git repository. Cannot undo without git history."
    exit 1
  fi

  # Check if last commit was a version bump
  LAST_COMMIT_MSG=$(git log -1 --pretty=%B)
  if [[ ! "$LAST_COMMIT_MSG" =~ ^"chore: bump version to" ]]; then
    echo "Error: Last commit was not a version bump. Cannot undo."
    echo "Last commit message: $LAST_COMMIT_MSG"
    exit 1
  fi

  # Get current version
  CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PACKAGE_JSON" | cut -d'"' -f4)
  echo "Current version: $CURRENT_VERSION"

  # Check for uncommitted changes
  if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted changes that will be preserved."
  fi

  # Reset the last commit (HEAD~1 = one commit before the current HEAD)
  echo "Resetting to the commit before the version bump..."
  git reset --soft HEAD~1

  # Report success
  echo "Version undo completed! The version bump has been undone."
  echo "Changes from the version bump are now staged but not committed."
  exit 0
fi

# Check for valid arguments
if [[ "$VERSION_ACTION" != "major" && "$VERSION_ACTION" != "minor" && "$VERSION_ACTION" != "patch" ]]; then
  echo "Error: Invalid version action specified."
  show_usage
  exit 1
fi

# Get the current version from package.json
CURRENT_VERSION=$(grep -o '"version": "[^"]*"' "$PACKAGE_JSON" | cut -d'"' -f4)
echo "Current version: $CURRENT_VERSION"

# Split the version into its components
IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

# Increment the appropriate part
case "$VERSION_ACTION" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

# Create the new version string
NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New version: $NEW_VERSION"

# Update package.json
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS requires different sed syntax
  sed -i '' "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
else
  # Linux/Unix sed syntax
  sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$PACKAGE_JSON"
fi

# Check if we're in a git repository
if git rev-parse --git-dir > /dev/null 2>&1; then
  # Check if there are any changes to commit
  if git diff --exit-code "$PACKAGE_JSON" > /dev/null 2>&1; then
    echo "No changes detected in package.json."
  else
    # Commit the changes
    git add "$PACKAGE_JSON"
    git commit -m "chore: bump version to $NEW_VERSION"
    echo "Changes committed with message: 'chore: bump version to $NEW_VERSION'"

    # Suggest creating a tag
    echo ""
    echo "Consider tagging this release:"
    echo "  git tag v$NEW_VERSION"
    echo "  git push origin v$NEW_VERSION"
  fi
else
  echo "Not a git repository. Changes saved but not committed."
fi

echo "Version bump completed!"
