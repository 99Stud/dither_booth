import { useState } from "react";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";
import { useKit } from "#kits/useKit";

import { CameraStage } from "./internal/components/CameraStage/index";
import { CaptureFlash } from "./internal/components/CaptureFlash/index";
import { DarkroomHotspot } from "./internal/components/DarkroomHotspot/index";
import { FrozenPhoto } from "./internal/components/FrozenPhoto/index";
import { KitLanding } from "./internal/components/KitLanding/index";
import { MaintenanceScreen } from "./internal/components/MaintenanceScreen/index";
import { PostPrintStage } from "./internal/components/PostPrintStage/index";
import { SlotMachineStage } from "./internal/components/SlotMachineStage/index";
import { experienceStageClassName } from "./internal/Experience.styles";
import { useExperienceFlow } from "./internal/hooks/useExperienceFlow";

export const Experience = () => {
  const {
    captureFlashId,
    countdown,
    drawResult,
    handleCameraAnimationComplete,
    handlePromptAnimationComplete,
    handleReelsStopped,
    handleStartButtonAnimationComplete,
    handleStartExperience,
    isCameraVisible,
    isFrozenPhotoVisible,
    isIntroDecorationsVisible,
    hasLottery,
    isMaintenance,
    isPostPrintVisible,
    isPromptInSquare,
    isPromptVisible,
    isSlotVisible,
    isStartButtonAtOrigin,
    isStartButtonVisible,
    isStartDisabled,
    lotteryStatus,
    phase,
    photoUrl,
    prompt,
    webcamRef,
  } = useExperienceFlow();
  const [splitTilePx, setSplitTilePx] = useState(0);
  const kit = useKit();

  return (
    <>
      <InteractiveBackground preset={kit.background} />
      <CaptureFlash captureId={captureFlashId} />
      <DarkroomHotspot isEnabled={phase === "idle"} />
      <KitLanding
        isIntroVisible={isIntroDecorationsVisible}
        lotteryStatus={lotteryStatus}
        start={{
          disabled: isStartDisabled,
          isAtOrigin: isStartButtonAtOrigin,
          isVisible: isStartButtonVisible,
          onAnimationComplete: handleStartButtonAnimationComplete,
          onStart: handleStartExperience,
        }}
      />
      <MaintenanceScreen isVisible={isMaintenance} />
      <div className={experienceStageClassName}>
        <CameraStage
          countdown={countdown}
          isCameraVisible={isCameraVisible}
          isLiveFeedVisible={!isFrozenPhotoVisible}
          isPromptInSquare={isPromptInSquare}
          isPromptVisible={isPromptVisible}
          onCameraAnimationComplete={handleCameraAnimationComplete}
          onPromptAnimationComplete={handlePromptAnimationComplete}
          onSplitTile={setSplitTilePx}
          prompt={prompt}
          splitTilePx={splitTilePx}
          webcamRef={webcamRef}
        >
          <FrozenPhoto
            isBesideSlot={hasLottery}
            isVisible={isFrozenPhotoVisible}
            photoUrl={photoUrl}
            tilePx={splitTilePx}
          />
          <SlotMachineStage
            drawResult={drawResult}
            isVisible={isSlotVisible}
            onReelsStopped={handleReelsStopped}
            phase={phase}
          />
        </CameraStage>
        <PostPrintStage isVisible={isPostPrintVisible} phase={phase} />
      </div>
    </>
  );
};
