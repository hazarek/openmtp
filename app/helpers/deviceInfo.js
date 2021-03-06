import { IS_RENDERER } from '../constants/env';
import { isEmpty } from '../utils/funcs';

export function getDeviceInfo() {
  if (IS_RENDERER) {
    // import it here so that the main process doesnt crash
    // eslint-disable-next-line global-require
    const { store } = require('../store/configureStore');
    const state = store?.getState();

    if (isEmpty(state)) {
      return {};
    }

    const info = state?.Home?.mtpDevice?.info?.mtpDeviceInfo;

    if (isEmpty(info)) {
      return {};
    }

    const {
      StandardVersion,
      MTPVersion,
      MTPExtension,
      Manufacturer,
      Model,
      DeviceVersion,
    } = info;

    return {
      StandardVersion,
      MTPVersion,
      MTPExtension,
      Manufacturer,
      Model,
      DeviceVersion,
    };
  }

  return {};
}
