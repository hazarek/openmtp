import path from 'path';
import { getPlatform } from '../utils/getPlatform';
import { IS_PROD } from '../constants/env';
import { PATHS } from '../constants/paths';
import { isPackaged } from '../utils/isPackaged';

const { root } = PATHS;

const binariesPath =
  IS_PROD && isPackaged
    ? path.join(root, './Contents', './Resources', './bin')
    : path.join(root, './build', getPlatform(), './bin');

export const mtpCliPath = path.resolve(path.join(binariesPath, './mtp-cli'));

export const kalamDebugReportCli = path.resolve(
  path.join(binariesPath, './kalam_debug_report')
);

export const kalamLibPath = path.resolve(
  path.join(binariesPath, './kalam.dylib')
);
