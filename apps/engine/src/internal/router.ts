import { browserAutomation } from "#domains/browser-automation/index";
import { darkroom } from "#domains/darkroom/index";
import { event, eventBooth } from "#domains/event/index";
import { fontLibrary, fontLibraryBooth } from "#domains/font-library/index";
import { healthz } from "#domains/healthz/index";
import { imageManipulation } from "#domains/image-manipulation/index";
import { kiosk } from "#domains/kiosk/index";
import { lottery } from "#domains/lottery/index";
import { printConfiguration } from "#domains/print-configuration/index";
import { receipt } from "#domains/receipt/index";

import { router } from "./trpc";

// Each group's procedures are built on that group's base procedure in
// `./trpc`, which carries its access check.
export const engineRouter = router({
  booth: router({
    getKit: eventBooth.getKit,
    getFontAsset: fontLibraryBooth.getFontAsset,
    getLotteryStatus: lottery.getLotteryStatus,
    prepareReceipt: receipt.prepareReceipt,
    printPreparedReceipt: receipt.printPreparedReceipt,
    onKioskCommand: kiosk.onKioskCommand,
    reportKioskStatus: kiosk.reportKioskStatus,
    sendKioskCameraSignal: kiosk.sendKioskCameraSignal,
    unlockDarkroom: darkroom.unlockDarkroom,
    lockDarkroom: darkroom.lockDarkroom,
  }),
  config: router({
    ...event,
    ...fontLibrary,
    ...printConfiguration,
    ...imageManipulation,
    generateReceipt: receipt.generateReceipt,
    printReceipt: receipt.printReceipt,
    printSampleLotteryTicket: receipt.printSampleLotteryTicket,
    getDarkroomPinStatus: darkroom.getDarkroomPinStatus,
    setDarkroomPin: darkroom.setDarkroomPin,
  }),
  ops: router({
    ...healthz,
    ...browserAutomation,
    reloadKiosk: kiosk.reloadKiosk,
    sendCameraSignal: kiosk.sendCameraSignal,
    setKioskMaintenance: kiosk.setKioskMaintenance,
    showKioskScreen: kiosk.showKioskScreen,
    watchCamera: kiosk.watchCamera,
  }),
});
