import {
  app,
  dialog,
  session,
  type Session,
  type BrowserWindow,
  type FilesystemPermissionRequest,
  type MediaAccessPermissionRequest,
  type PermissionCheckHandlerHandlerDetails
} from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'path'

export type ManagedPermission =
  | 'fileSystem'
  | 'camera'
  | 'microphone'
  | 'notifications'
  | 'geolocation'
  | 'clipboardRead'
  | 'clipboardWrite'
export type FileSystemAccessMode = 'readable' | 'writable'
export type PermissionDecision = 'ask' | 'allow' | 'block'
export type PermissionState = 'granted' | 'prompt' | 'denied'

export interface PermissionSetting {
  permission: ManagedPermission
  mode?: FileSystemAccessMode
  decision: PermissionDecision
}

type PermissionInheritanceSource = 'writable'

interface StoredPermissionRule {
  partition: string
  origin: string
  permission: ManagedPermission
  mode?: FileSystemAccessMode
  decision: Exclude<PermissionDecision, 'ask'>
  inheritedFrom?: PermissionInheritanceSource
}

interface ServicePermissionTarget {
  partitionId: string
  url: string
}

interface UpdatePermissionInput extends ServicePermissionTarget {
  permission: ManagedPermission
  mode?: FileSystemAccessMode
  decision: PermissionDecision
}

type DirectManagedPermission = Exclude<ManagedPermission, 'fileSystem'>
type KnownRequestPermission =
  | 'fileSystem'
  | 'media'
  | 'notifications'
  | 'geolocation'
  | 'display-capture'
  | 'fullscreen'
  | 'pointerLock'
  | 'keyboardLock'
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'storage-access'
  | 'top-level-storage-access'
  | 'openExternal'
  | 'speaker-selection'
  | 'window-management'
  | 'idle-detection'
  | 'hid'
  | 'serial'
  | 'usb'
  | 'midi'
  | 'midiSysex'
  | 'mediaKeySystem'
  | 'unknown'
  | 'deprecated-sync-clipboard-read'

const configuredPartitions = new Set<string>()
const sessionPermissionGrants = new Set<string>()
let persistedPermissionRules: StoredPermissionRule[] = []
const loggedPermissionEvents = new Set<string>()
const permissionStorePath = () => join(app.getPath('userData'), 'permissions.json')

const directManagedPermissions: DirectManagedPermission[] = [
  'camera',
  'microphone',
  'notifications',
  'geolocation',
  'clipboardRead',
  'clipboardWrite'
]
const compatibilityAllowedPermissions = new Set<KnownRequestPermission>([
  'display-capture',
  'fullscreen',
  'pointerLock',
  'keyboardLock',
  'window-management'
])

export function parseOrigin(url: string | undefined) {
  if (!url) return ''

  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

function buildPermissionKey(
  partition: string,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
) {
  return JSON.stringify([partition, origin, permission, mode ?? null])
}

function logPermissionEvent(
  label: string,
  partition: string,
  origin: string,
  permission: string,
  extra?: unknown
) {
  const key = JSON.stringify([label, partition, origin, permission, extra ?? null])
  if (loggedPermissionEvents.has(key)) {
    return
  }

  loggedPermissionEvents.add(key)
  console.log(`[perm] ${label}`, {
    partition,
    origin,
    permission,
    extra
  })
}

function isFileSystemMode(value: string | undefined): value is FileSystemAccessMode {
  return value === 'readable' || value === 'writable'
}

function listFileSystemPermissionSettings(partition: string, origin: string): PermissionSetting[] {
  return (['readable', 'writable'] as FileSystemAccessMode[]).map((mode) => ({
    permission: 'fileSystem',
    mode,
    decision: getFileSystemPersistedDecision(partition, origin, mode)
  }))
}

function listDirectPermissionSettings(partition: string, origin: string): PermissionSetting[] {
  return directManagedPermissions.map((permission) => ({
    permission,
    decision: getPersistedPermissionDecision(partition, origin, permission)
  }))
}

function getPersistedPermissionDecision(
  partition: string,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
): PermissionDecision {
  const rule = persistedPermissionRules.find(
    (entry) =>
      entry.partition === partition &&
      entry.origin === origin &&
      entry.permission === permission &&
      entry.mode === mode
  )

  return rule?.decision ?? 'ask'
}

function getFileSystemPersistedDecision(
  partition: string,
  origin: string,
  mode: FileSystemAccessMode
): PermissionDecision {
  const directDecision = getPersistedPermissionDecision(partition, origin, 'fileSystem', mode)
  if (directDecision !== 'ask') {
    return directDecision
  }

  if (mode === 'readable') {
    const writableDecision = getPersistedPermissionDecision(
      partition,
      origin,
      'fileSystem',
      'writable'
    )

    if (writableDecision === 'allow') {
      return 'allow'
    }
  }

  return 'ask'
}

function toPermissionState(decision: PermissionDecision): PermissionState {
  if (decision === 'allow') {
    return 'granted'
  }

  if (decision === 'block') {
    return 'denied'
  }

  return 'prompt'
}

function hasSessionPermissionGrant(
  partition: string,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
) {
  return sessionPermissionGrants.has(buildPermissionKey(partition, origin, permission, mode))
}

function addSessionPermissionGrant(
  partition: string,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
) {
  sessionPermissionGrants.add(buildPermissionKey(partition, origin, permission, mode))
}

function clearSessionPermissionGrants(
  partition: string,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
) {
  if (permission !== 'fileSystem') {
    sessionPermissionGrants.delete(buildPermissionKey(partition, origin, permission, mode))
    return
  }

  // Writable access implicitly grants readable access, so clearing either
  // file-system row needs to remove both session grants.
  sessionPermissionGrants.delete(buildPermissionKey(partition, origin, 'fileSystem', 'readable'))
  sessionPermissionGrants.delete(buildPermissionKey(partition, origin, 'fileSystem', 'writable'))
}

function hasFileSystemSessionGrant(partition: string, origin: string, mode: FileSystemAccessMode) {
  if (hasSessionPermissionGrant(partition, origin, 'fileSystem', mode)) {
    return true
  }

  return (
    mode === 'readable' && hasSessionPermissionGrant(partition, origin, 'fileSystem', 'writable')
  )
}

function setPersistedPermissionDecision(
  partition: string,
  origin: string,
  permission: ManagedPermission,
  mode: FileSystemAccessMode | undefined,
  decision: PermissionDecision,
  inheritedFrom?: PermissionInheritanceSource
) {
  persistedPermissionRules = persistedPermissionRules.filter(
    (entry) =>
      !(
        entry.partition === partition &&
        entry.origin === origin &&
        entry.permission === permission &&
        entry.mode === mode
      )
  )

  if (decision !== 'ask') {
    persistedPermissionRules.push({ partition, origin, permission, mode, decision, inheritedFrom })
  }
}

function clearInheritedFileSystemReadPermission(partition: string, origin: string) {
  persistedPermissionRules = persistedPermissionRules.filter(
    (entry) =>
      !(
        entry.partition === partition &&
        entry.origin === origin &&
        entry.permission === 'fileSystem' &&
        entry.mode === 'readable' &&
        entry.inheritedFrom === 'writable'
      )
  )
}

function savePermissionStore() {
  try {
    writeFileSync(permissionStorePath(), JSON.stringify(persistedPermissionRules, null, 2), 'utf8')
  } catch (error) {
    console.error('Failed to save permissions:', error)
  }
}

export function loadPermissionStore() {
  if (existsSync(permissionStorePath())) {
    try {
      const parsed = JSON.parse(readFileSync(permissionStorePath(), 'utf8'))
      persistedPermissionRules = Array.isArray(parsed) ? parsed : []
      return
    } catch (error) {
      console.error('Failed to load permissions:', error)
    }
  }
}

export function listServicePermissions(target: ServicePermissionTarget): PermissionSetting[] {
  const partition = `persist:${target.partitionId}`
  const origin = parseOrigin(target.url)
  return [
    ...listFileSystemPermissionSettings(partition, origin),
    ...listDirectPermissionSettings(partition, origin)
  ]
}

export function updateServicePermission(input: UpdatePermissionInput): PermissionSetting[] {
  const partition = `persist:${input.partitionId}`
  const origin = parseOrigin(input.url)

  clearSessionPermissionGrants(partition, origin, input.permission, input.mode)
  setPersistedPermissionDecision(partition, origin, input.permission, input.mode, input.decision)

  if (input.permission === 'fileSystem' && input.mode === 'writable') {
    if (input.decision === 'allow') {
      setPersistedPermissionDecision(
        partition,
        origin,
        'fileSystem',
        'readable',
        'allow',
        'writable'
      )
    } else {
      clearInheritedFileSystemReadPermission(partition, origin)
    }
  }

  savePermissionStore()

  return listServicePermissions(input)
}

function getManagedPermissionDecision(
  partition: string,
  origin: string,
  permission: DirectManagedPermission
): PermissionDecision {
  if (hasSessionPermissionGrant(partition, origin, permission)) {
    return 'allow'
  }

  return getPersistedPermissionDecision(partition, origin, permission)
}

function getFileSystemDecision(
  partition: string,
  origin: string,
  details: { fileAccessType?: string }
): PermissionDecision {
  const mode = isFileSystemMode(details.fileAccessType) ? details.fileAccessType : 'readable'
  if (hasFileSystemSessionGrant(partition, origin, mode)) {
    return 'allow'
  }

  return getFileSystemPersistedDecision(partition, origin, mode)
}

function getFileSystemPermissionState(
  partition: string,
  origin: string,
  mode: FileSystemAccessMode
): PermissionState {
  return toPermissionState(getFileSystemDecision(partition, origin, { fileAccessType: mode }))
}

function getManagedPermissionState(
  partition: string,
  origin: string,
  permission: DirectManagedPermission
): PermissionState {
  return toPermissionState(getManagedPermissionDecision(partition, origin, permission))
}

function getRequestedMediaPermissions(
  mediaTypes: Array<'video' | 'audio'> | undefined
): DirectManagedPermission[] {
  const permissions = new Set<DirectManagedPermission>()

  for (const mediaType of mediaTypes ?? []) {
    if (mediaType === 'video') {
      permissions.add('camera')
    }
    if (mediaType === 'audio') {
      permissions.add('microphone')
    }
  }

  if (permissions.size === 0) {
    permissions.add('camera')
    permissions.add('microphone')
  }

  return Array.from(permissions)
}

function getRequestedMediaPermissionsForCheck(
  details: PermissionCheckHandlerHandlerDetails
): DirectManagedPermission[] {
  if (details.mediaType === 'video') {
    return ['camera']
  }

  if (details.mediaType === 'audio') {
    return ['microphone']
  }

  return ['camera', 'microphone']
}

function getPermissionsState(
  partition: string,
  origin: string,
  permissions: DirectManagedPermission[]
): PermissionState {
  let hasPrompt = false

  for (const permission of permissions) {
    const state = getManagedPermissionState(partition, origin, permission)

    if (state === 'denied') {
      return 'denied'
    }

    if (state === 'prompt') {
      hasPrompt = true
    }
  }

  return hasPrompt ? 'prompt' : 'granted'
}

function describeManagedPermissions(permissions: DirectManagedPermission[]) {
  const uniquePermissions = Array.from(new Set(permissions))

  if (
    uniquePermissions.length === 2 &&
    uniquePermissions.includes('camera') &&
    uniquePermissions.includes('microphone')
  ) {
    return 'use your camera and microphone'
  }

  return uniquePermissions
    .map((permission) => {
      switch (permission) {
        case 'camera':
          return 'use your camera'
        case 'microphone':
          return 'use your microphone'
        case 'notifications':
          return 'show notifications'
        case 'geolocation':
          return 'know your location'
        case 'clipboardRead':
          return 'read your clipboard'
        case 'clipboardWrite':
          return 'write to your clipboard'
      }
    })
    .join(' and ')
}

function getManagedPermissionForElectronPermission(
  permission: string
): DirectManagedPermission | null {
  switch (permission) {
    case 'notifications':
      return 'notifications'
    case 'geolocation':
      return 'geolocation'
    case 'clipboard-read':
    case 'deprecated-sync-clipboard-read':
      return 'clipboardRead'
    case 'clipboard-sanitized-write':
      return 'clipboardWrite'
    default:
      return null
  }
}

function promptForManagedPermissions(
  mainWindow: BrowserWindow,
  partition: string,
  origin: string,
  permissions: DirectManagedPermission[]
): PermissionState {
  const uniquePermissions = Array.from(new Set(permissions))
  const existingState = getPermissionsState(partition, origin, uniquePermissions)
  if (existingState !== 'prompt') {
    return existingState
  }

  const response = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    title: 'Site Permission',
    message: `${origin || 'This site'} wants to ${describeManagedPermissions(uniquePermissions)}.`,
    buttons: ['Allow on every visit', 'Ask every time', "Don't allow"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (response === 0) {
    for (const permission of uniquePermissions) {
      addSessionPermissionGrant(partition, origin, permission)
      setPersistedPermissionDecision(partition, origin, permission, undefined, 'allow')
    }
    savePermissionStore()
    return 'granted'
  }

  if (response === 1) {
    for (const permission of uniquePermissions) {
      addSessionPermissionGrant(partition, origin, permission)
    }
    return 'granted'
  }

  for (const permission of uniquePermissions) {
    clearSessionPermissionGrants(partition, origin, permission)
    setPersistedPermissionDecision(partition, origin, permission, undefined, 'block')
  }
  savePermissionStore()
  return 'denied'
}

function promptForFileSystemPermission(
  mainWindow: BrowserWindow,
  partition: string,
  origin: string,
  mode: FileSystemAccessMode,
  targetPath?: string
): PermissionState {
  const existingState = getFileSystemPermissionState(partition, origin, mode)
  if (existingState !== 'prompt') {
    return existingState
  }

  const accessType = mode === 'writable' ? 'edit' : 'view'
  const targetName = targetPath ? basename(targetPath) : 'selected item'

  const response = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    title: 'File System Access',
    message: `${origin || 'This site'} wants to ${accessType} ${targetName}.`,
    detail: targetPath || undefined,
    buttons: ['Allow on every visit', 'Ask every time', "Don't allow"],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })

  if (response === 0) {
    addSessionPermissionGrant(partition, origin, 'fileSystem', mode)
    setPersistedPermissionDecision(partition, origin, 'fileSystem', mode, 'allow')
    if (mode === 'writable') {
      setPersistedPermissionDecision(
        partition,
        origin,
        'fileSystem',
        'readable',
        'allow',
        'writable'
      )
    }
    savePermissionStore()
    return 'granted'
  }

  if (response === 1) {
    addSessionPermissionGrant(partition, origin, 'fileSystem', mode)
    return 'granted'
  }

  clearSessionPermissionGrants(partition, origin, 'fileSystem', mode)
  setPersistedPermissionDecision(partition, origin, 'fileSystem', mode, 'block')
  if (mode === 'writable') {
    clearInheritedFileSystemReadPermission(partition, origin)
  }
  savePermissionStore()
  return 'denied'
}

function resolveConfiguredPartition(targetSession: Session): string | null {
  for (const partition of configuredPartitions) {
    if (session.fromPartition(partition) === targetSession) {
      return partition
    }
  }

  return null
}

export function queryPermissionForSession(
  targetSession: Session,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
): PermissionState {
  const partition = resolveConfiguredPartition(targetSession)
  if (!partition) {
    return 'prompt'
  }

  if (permission === 'fileSystem') {
    return getFileSystemPermissionState(partition, origin, mode ?? 'readable')
  }

  return getManagedPermissionState(partition, origin, permission)
}

export function requestPermissionForSession(
  mainWindow: BrowserWindow,
  targetSession: Session,
  origin: string,
  permission: ManagedPermission,
  mode?: FileSystemAccessMode
): PermissionState {
  const partition = resolveConfiguredPartition(targetSession)
  if (!partition) {
    return 'prompt'
  }

  if (permission === 'fileSystem') {
    return promptForFileSystemPermission(mainWindow, partition, origin, mode ?? 'readable')
  }

  return promptForManagedPermissions(mainWindow, partition, origin, [permission])
}

export function configurePermissions(mainWindow: BrowserWindow, partition?: string) {
  if (!partition?.startsWith('persist:') || configuredPartitions.has(partition)) {
    return
  }

  const partitionSession = session.fromPartition(partition)

  partitionSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin, details) => {
      const origin = parseOrigin(
        requestingOrigin || details.securityOrigin || details.requestingUrl || webContents?.getURL()
      )

      if (permission === 'fileSystem') {
        const decision = getFileSystemDecision(partition, origin, details)
        const allowed = decision === 'allow'

        if (!allowed) {
          logPermissionEvent('check-denied', partition, origin, permission, details)
        }

        return allowed
      }

      if (permission === 'media') {
        const requestedPermissions = getRequestedMediaPermissionsForCheck(details)
        const allowed = getPermissionsState(partition, origin, requestedPermissions) === 'granted'

        if (!allowed) {
          logPermissionEvent('check-denied', partition, origin, permission, {
            requestedPermissions,
            details
          })
        }

        return allowed
      }

      const managedPermission = getManagedPermissionForElectronPermission(permission)
      if (managedPermission) {
        const allowed =
          getManagedPermissionState(partition, origin, managedPermission) === 'granted'

        if (!allowed) {
          logPermissionEvent('check-denied', partition, origin, permission, {
            managedPermission
          })
        }

        return allowed
      }

      if (compatibilityAllowedPermissions.has(permission as KnownRequestPermission)) {
        return true
      }

      logPermissionEvent('check-default-deny', partition, origin, permission, details)
      return false
    }
  )

  partitionSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestOrigin = parseOrigin(
      (details as { securityOrigin?: string }).securityOrigin ||
        details.requestingUrl ||
        webContents.getURL()
    )

    if (permission === 'fileSystem') {
      const fileSystemDetails = details as FilesystemPermissionRequest
      const mode = isFileSystemMode(fileSystemDetails.fileAccessType)
        ? fileSystemDetails.fileAccessType
        : 'readable'
      const targetPath =
        typeof fileSystemDetails.filePath === 'string' ? fileSystemDetails.filePath : ''

      const permissionState = promptForFileSystemPermission(
        mainWindow,
        partition,
        requestOrigin,
        mode,
        targetPath
      )
      callback(permissionState === 'granted')
      return
    }

    if (permission === 'media') {
      const requestedPermissions = getRequestedMediaPermissions(
        (details as MediaAccessPermissionRequest).mediaTypes
      )
      const permissionState = promptForManagedPermissions(
        mainWindow,
        partition,
        requestOrigin,
        requestedPermissions
      )
      callback(permissionState === 'granted')
      return
    }

    const managedPermission = getManagedPermissionForElectronPermission(permission)
    if (managedPermission) {
      const permissionState = promptForManagedPermissions(mainWindow, partition, requestOrigin, [
        managedPermission
      ])
      callback(permissionState === 'granted')
      return
    }

    if (compatibilityAllowedPermissions.has(permission as KnownRequestPermission)) {
      callback(true)
      return
    }

    logPermissionEvent('request-default-deny', partition, requestOrigin, permission, details)
    callback(false)
  })

  configuredPartitions.add(partition)
}
