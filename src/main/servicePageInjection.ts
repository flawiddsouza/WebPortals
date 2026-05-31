export function buildServicePageInjection(serviceId: string) {
  return `
    window._serviceId = ${JSON.stringify(serviceId)};
    window.prompt = window.WebPortals.prompt;
    ${notificationsClassDefinition}
    ${displayMediaPatchCode}
    ${fileSystemPermissionPatchCode}
    ;0
  `
}

const notificationsClassDefinition = `(() => {
const originalNotification = window.Notification;

if (!originalNotification) {
  return;
}

const toBrowserPermission = (state) => {
  switch (state) {
    case 'granted':
      return 'granted';
    case 'denied':
      return 'denied';
    default:
      return 'default';
  }
};

class NotificationShim {
  static get permission() {
    return toBrowserPermission(window.WebPortals.queryPermissionSync('notifications'));
  }

  static async requestPermission(cb) {
    const permission = toBrowserPermission(
      await window.WebPortals.requestPermission('notifications')
    );

    if (typeof cb === 'function') {
      cb(permission);
    }

    return permission;
  }

  constructor(title, options) {
    if (NotificationShim.permission !== 'granted') {
      throw new TypeError('Notification permission has not been granted.');
    }

    const notification = new originalNotification(title, options);
    notification.addEventListener('click', () => {
      window.WebPortals.notificationClick(window._serviceId);
    });
    return notification;
  }
}

Object.setPrototypeOf(NotificationShim, originalNotification);
Object.setPrototypeOf(NotificationShim.prototype, originalNotification.prototype);
window.Notification = NotificationShim;
})();`

const displayMediaPatchCode = `
  (function() {
    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }

    navigator.mediaDevices.getDisplayMedia = async function() {
      try {
        const customConstraints = await window.WebPortals.getDisplayMedia(window._serviceId);

        if (!customConstraints) {
          const error = new Error('Permission denied by user');
          error.name = 'NotAllowedError';
          throw error;
        }

        return await navigator.mediaDevices.getUserMedia(customConstraints);
      } catch (error) {
        console.error('WebPortals getDisplayMedia error:', error);
        throw error;
      }
    };
  })();
`

const fileSystemPermissionPatchCode = `
  (function() {
    const FileSystemHandleCtor = window.FileSystemHandle;
    if (!FileSystemHandleCtor || !FileSystemHandleCtor.prototype) {
      return;
    }

    if (window.__webPortalsFsPermissionPatchApplied) {
      return;
    }

    const normalizeMode = (options) => {
      return options && options.mode === 'readwrite' ? 'writable' : 'readable';
    };

    FileSystemHandleCtor.prototype.queryPermission = function(options) {
      return window.WebPortals.queryFileSystemPermission(normalizeMode(options));
    };

    FileSystemHandleCtor.prototype.requestPermission = function(options) {
      return window.WebPortals.requestFileSystemPermission(normalizeMode(options));
    };

    window.__webPortalsFsPermissionPatchApplied = true;
  })();
`
