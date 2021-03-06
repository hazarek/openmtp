/* eslint global-require: off */

import './services/sentry/index';

import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import electronIs from 'electron-is';
import usbDetect from 'usb-detection';
import MenuBuilder from './menu';
import { log } from './utils/log';
import { DEBUG_PROD, IS_DEV, IS_PROD } from './constants/env';
import AppUpdate from './classes/AppUpdate';
import { PATHS } from './constants/paths';
import { settingsStorage } from './helpers/storageHelper';
import { AUTO_UPDATE_CHECK_FIREUP_DELAY } from './constants';
import { appEvents } from './utils/eventHandling';
import { bootLoader } from './helpers/bootHelper';
import { nonBootableDeviceWindow } from './helpers/createWindows';
import { APP_TITLE } from './constants/meta';
import { isPackaged } from './utils/isPackaged';
import { getWindowBackgroundColor } from './helpers/windowHelper';
import { APP_THEME_MODE_TYPE, DEVICE_TYPE, USB_HOTPLUG_EVENTS } from './enums';
import fileExplorerController from './data/file-explorer/controllers/FileExplorerController';
import { getEnablePrereleaseUpdatesSetting } from './helpers/settings';
import { COMMUNICATION_EVENTS } from './enums/communicationEvents';

const isSingleInstance = app.requestSingleInstanceLock();
const isDeviceBootable = bootTheDevice();
const isMas = electronIs.mas();
let mainWindow = null;

if (IS_PROD) {
  const sourceMapSupport = require('source-map-support');

  sourceMapSupport.install();
}

if (IS_DEV || DEBUG_PROD) {
  require('electron-debug')();
}

async function bootTheDevice() {
  try {
    // For an existing installation
    if (bootLoader.quickVerify()) {
      return true;
    }

    // For a fresh installation
    await bootLoader.init();

    return await bootLoader.verify();
  } catch (e) {
    throw new Error(e);
  }
}

async function installExtensions() {
  try {
    const installer = require('electron-devtools-installer');
    const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
    const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

    return Promise.all(
      extensions.map((name) =>
        installer.default(installer[name], forceDownload)
      )
    ).catch(console.error);
  } catch (e) {
    log.error(e, `main.dev -> installExtensions`);
  }
}

async function createWindow() {
  try {
    if (IS_DEV || DEBUG_PROD) {
      await installExtensions();
    }

    mainWindow = new BrowserWindow({
      title: `${APP_TITLE}`,
      center: true,
      show: false,
      minWidth: 880,
      minHeight: 640,
      titleBarStyle: 'hidden',
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true,
      },
      backgroundColor: getWindowBackgroundColor(),
    });

    mainWindow?.loadURL(`${PATHS.loadUrlPath}`);

    mainWindow?.webContents?.on('did-finish-load', () => {
      if (!mainWindow) {
        throw new Error(`"mainWindow" is not defined`);
      }

      if (process.env.START_MINIMIZED) {
        mainWindow.minimize();
      } else {
        mainWindow.maximize();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    mainWindow.onerror = (error) => {
      log.error(error, `main.dev -> mainWindow -> onerror`);
    };

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (e) {
    log.error(e, `main.dev -> createWindow`);
  }
}

/**
 * Checks whether device is ready to boot or not.
 * Here profile files are created if not found.
 */
if (!isDeviceBootable) {
  app.on('ready', async () => {
    try {
      nonBootableDeviceWindow();
    } catch (e) {
      throw new Error(e);
    }
  });

  app.on('window-all-closed', () => {
    try {
      app.quit();
    } catch (e) {
      throw new Error(e);
    }
  });
} else {
  if (IS_PROD) {
    process.on('uncaughtException', (error) => {
      log.error(error, `main.dev -> process -> uncaughtException`);
    });

    appEvents.on('error', (error) => {
      log.error(error, `main.dev -> appEvents -> error`);
    });

    ipcMain.removeAllListeners('ELECTRON_BROWSER_WINDOW_ALERT');
    ipcMain.on('ELECTRON_BROWSER_WINDOW_ALERT', (event, message, title) => {
      ipcMain.error(
        message,
        `main.dev -> ipcMain -> on ELECTRON_BROWSER_WINDOW_ALERT -> ${title}`
      );
      // eslint-disable-next-line no-param-reassign
      event.returnValue = 0;
    });
  }

  if (!isSingleInstance) {
    app.quit();
  } else {
    try {
      app.on('second-instance', () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }

          mainWindow.focus();
        }
      });

      app.on('ready', () => {});
    } catch (e) {
      log.error(e, `main.dev -> second-instance`);
    }
  }

  app.on('window-all-closed', () => {
    try {
      if (process.platform === 'darwin') {
        return;
      }

      app.quit();
    } catch (e) {
      log.error(e, `main.dev -> window-all-closed`);
    }
  });

  app.on('ready', async () => {
    try {
      await createWindow();

      let appUpdaterEnable = true;

      if (isPackaged && process.platform === 'darwin') {
        appUpdaterEnable = !isMas && app.isInApplicationsFolder();
      }

      const autoUpdateCheckSettings = settingsStorage.getItems([
        'enableBackgroundAutoUpdate',
        'enableAutoUpdateCheck',
      ]);

      const autoUpdateCheck =
        autoUpdateCheckSettings.enableAutoUpdateCheck !== false;
      const isPrereleaseUpdatesEnabled = getEnablePrereleaseUpdatesSetting();

      const autoAppUpdate = new AppUpdate({
        autoUpdateCheck,
        autoDownload:
          autoUpdateCheckSettings.enableBackgroundAutoUpdate !== false,
        allowPrerelease: isPrereleaseUpdatesEnabled === true,
      });

      autoAppUpdate.init();

      const menuBuilder = new MenuBuilder({
        mainWindow,
        autoAppUpdate,
        appUpdaterEnable,
      });

      menuBuilder.buildMenu();

      if (autoUpdateCheck && appUpdaterEnable) {
        setTimeout(() => {
          autoAppUpdate.checkForUpdates();
        }, AUTO_UPDATE_CHECK_FIREUP_DELAY);
      }

      // send attach and detach events to the renderer
      usbDetect.startMonitoring();

      usbDetect.on('add', (device) => {
        if (!mainWindow) {
          return;
        }

        mainWindow?.webContents?.send(COMMUNICATION_EVENTS.usbHotplug, {
          device: JSON.stringify(device),
          eventName: USB_HOTPLUG_EVENTS.attach,
        });
      });

      usbDetect.on('remove', (device) => {
        if (!mainWindow) {
          return;
        }

        mainWindow?.webContents?.send(COMMUNICATION_EVENTS.usbHotplug, {
          device: JSON.stringify(device),
          eventName: USB_HOTPLUG_EVENTS.detach,
        });
      });
    } catch (e) {
      log.error(e, `main.dev -> ready`);
    }
  });

  app.on('activate', async () => {
    try {
      if (mainWindow === null) {
        await createWindow();
      }
    } catch (e) {
      log.error(e, `main.dev -> activate`);
    }
  });

  app.on('before-quit', async () => {
    fileExplorerController
      .dispose({
        deviceType: DEVICE_TYPE.mtp,
      })
      .catch((e) => {
        log.error(e, `main.dev -> before-quit`);
      });

    usbDetect.stopMonitoring();

    app.quitting = true;
  });

  nativeTheme.on('updated', () => {
    const setting = settingsStorage.getItems(['appThemeMode']);

    // if the app theme is 'auto' and if the os theme has changed
    // then refresh the app theme
    if (setting.appThemeMode !== APP_THEME_MODE_TYPE.auto) {
      return;
    }

    if (!mainWindow) {
      return;
    }

    mainWindow?.webContents?.send('nativeThemeUpdated', {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    });
  });
}
