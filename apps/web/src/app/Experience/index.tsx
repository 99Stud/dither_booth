import { useState } from "react";

import { InteractiveBackground } from "#components/misc/InteractiveBackground/index";

import { CameraStage } from "./internal/components/CameraStage/index";
import { CaptureFlash } from "./internal/components/CaptureFlash/index";
import { FrozenPhoto } from "./internal/components/FrozenPhoto/index";
import { IntroChrome } from "./internal/components/IntroChrome/index";
import { PostPrintStage } from "./internal/components/PostPrintStage/index";
import { SlotMachineStage } from "./internal/components/SlotMachineStage/index";
import { StartExperienceButton } from "./internal/components/StartExperienceButton/index";
import { KIOSK_INTERACTIVE_BACKGROUND_OPTIONS } from "./internal/Experience.constants";
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
    isPostPrintVisible,
    isPromptVisible,
    isSlotVisible,
    isStartButtonAtOrigin,
    isStartButtonVisible,
    isStartDisabled,
    lotteryStatus,
    phase,
    photoUrl,
    promptText,
    webcamRef,
  } = useExperienceFlow();
  const [splitTilePx, setSplitTilePx] = useState(0);

  return (
    <>
      <InteractiveBackground options={KIOSK_INTERACTIVE_BACKGROUND_OPTIONS} />
      <CaptureFlash captureId={captureFlashId} />
      <IntroChrome
        isVisible={isIntroDecorationsVisible}
        lotteryStatus={lotteryStatus}
      />
      <StartExperienceButton
        disabled={isStartDisabled}
        isAtOrigin={isStartButtonAtOrigin}
        isVisible={isStartButtonVisible}
        onAnimationComplete={handleStartButtonAnimationComplete}
        onStart={handleStartExperience}
      />
      <div className={experienceStageClassName}>
        <CameraStage
          countdown={countdown}
          isCameraVisible={isCameraVisible}
          isLiveFeedVisible={!isFrozenPhotoVisible}
          isPromptVisible={isPromptVisible}
          onCameraAnimationComplete={handleCameraAnimationComplete}
          onPromptAnimationComplete={handlePromptAnimationComplete}
          onSplitTile={setSplitTilePx}
          promptText={promptText}
          splitTilePx={splitTilePx}
          webcamRef={webcamRef}
        >
          <FrozenPhoto
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
