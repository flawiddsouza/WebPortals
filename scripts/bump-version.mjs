import { existsSync, readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'

function showUsage() {
  console.log('Usage: node scripts/bump-version.mjs [major|minor|patch|undo]')
  console.log('  major: Bump major version (X.0.0)')
  console.log('  minor: Bump minor version (x.X.0)')
  console.log('  patch: Bump patch version (x.x.X)')
  console.log('  undo:  Revert to the previous version (from last commit)')
  console.log('A version action must be specified.')
}

function isGitRepo() {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

if (process.argv.length < 3) {
  console.error('Error: No version action specified.')
  showUsage()
  process.exit(1)
}

if (!isGitRepo()) {
  console.error('Error: Not a git repository. This script requires a git repository to run.')
  process.exit(1)
}

const VERSION_ACTION = process.argv[2]
const PACKAGE_JSON = 'package.json'
const PACKAGE_LOCK_JSON = 'package-lock.json'

if (!existsSync(PACKAGE_JSON)) {
  console.error('Error: package.json not found.')
  process.exit(1)
}

if (VERSION_ACTION === 'undo') {
  const lastCommitMsg = execSync('git log -1 --pretty=%B').toString().trim()
  if (!lastCommitMsg.startsWith('chore: bump version to')) {
    console.error('Error: Last commit was not a version bump. Cannot undo.')
    console.error(`Last commit message: ${lastCommitMsg}`)
    process.exit(1)
  }

  const currentVersion = JSON.parse(readFileSync(PACKAGE_JSON)).version
  console.log(`Current version: ${currentVersion}`)

  // Check for other uncommitted changes that aren't related to version files
  const hasOtherChanges = execSync('git status --porcelain')
    .toString()
    .split('\n')
    .some(
      (line) => line.trim() && !line.includes(PACKAGE_JSON) && !line.includes(PACKAGE_LOCK_JSON)
    )

  if (hasOtherChanges) {
    console.warn('Warning: You have uncommitted changes not related to version files.')
    console.warn('These changes will be preserved during the undo operation.')
  }

  console.log('Resetting to the commit before the version bump...')
  execSync('git reset --soft HEAD~1')

  // Checkout the specific files to fully undo the version changes
  console.log(`Restoring ${PACKAGE_JSON} and ${PACKAGE_LOCK_JSON} from the previous commit...`)
  execSync(`git checkout HEAD -- ${PACKAGE_JSON}`)
  if (existsSync(PACKAGE_LOCK_JSON)) {
    execSync(`git checkout HEAD -- ${PACKAGE_LOCK_JSON}`)
  }

  // Output the reverted version
  const revertedVersion = JSON.parse(readFileSync(PACKAGE_JSON)).version
  console.log(`Version reverted to: ${revertedVersion}`)
  console.log('Version undo completed successfully!')
  process.exit(0)
}

if (!['major', 'minor', 'patch'].includes(VERSION_ACTION)) {
  console.error('Error: Invalid version action specified.')
  showUsage()
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync(PACKAGE_JSON))
const currentVersion = packageJson.version
console.log(`Current version: ${currentVersion}`)

const [major, minor, patch] = currentVersion.split('.').map(Number)
let newVersion
switch (VERSION_ACTION) {
  case 'major':
    newVersion = `${major + 1}.0.0`
    break
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`
    break
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`
    break
}

console.log(`New version: ${newVersion}`)
packageJson.version = newVersion
writeFileSync(PACKAGE_JSON, JSON.stringify(packageJson, null, 2) + '\n')

if (existsSync(PACKAGE_LOCK_JSON)) {
  const packageLockJson = JSON.parse(readFileSync(PACKAGE_LOCK_JSON))
  packageLockJson.version = newVersion

  if (packageLockJson.packages && packageLockJson.packages['']) {
    packageLockJson.packages[''].version = newVersion
  }

  writeFileSync(PACKAGE_LOCK_JSON, JSON.stringify(packageLockJson, null, 2) + '\n')
}

try {
  try {
    execSync(`git diff --exit-code ${PACKAGE_JSON} ${PACKAGE_LOCK_JSON}`, { stdio: 'ignore' })
    console.log('No changes detected in package.json or package-lock.json.')
  } catch {
    execSync(`git add ${PACKAGE_JSON} ${PACKAGE_LOCK_JSON}`)
    execSync(`git commit -m "chore: bump version to ${newVersion}"`)
    console.log(`Changes committed with message: 'chore: bump version to ${newVersion}'`)
    console.log('\nConsider tagging this release:')
    console.log(`  git tag v${newVersion}`)
    console.log(`  git push origin v${newVersion}`)
  }
} catch (e) {
  console.error('Error during git operations:', e.message)
}

console.log('Version bump completed!')
